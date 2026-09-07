import csv
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from ..config import settings
from ..core.constants import DATASET_VERSION, DEFAULT_BASE_RATE
from ..models.schemas import (
    ConditionCode,
    HCCFactor,
    DemographicFactor,
    Patient,
    RAFCalculationResult,
    MappedConditionResult,
    UnmappedConditionResult,
    DemographicFactorResult,
)

class ClinicalEngine:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.condition_codes: List[ConditionCode] = []
        self.hcc_factors: List[HCCFactor] = []
        self.demographic_factors: List[DemographicFactor] = []
        self.patients: List[Patient] = []
        self.load_datasets()

    def load_datasets(self):
        # 1. Condition Codes
        cond_path = self.root_dir / "condition_codes.csv"
        if cond_path.exists():
            with open(cond_path, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self.condition_codes.append(
                        ConditionCode(
                            icd10_code=row["icd10_code"].strip(),
                            description=row["description"].strip(),
                            code_family=row["code_family"].strip(),
                            chapter=row["chapter"].strip(),
                            chronic=(row["chronic"].strip().lower() == "true"),
                            specificity="unspecified" if row.get("specificity", "").strip() == "unspecified" else "specified",
                            hcc_v28_code=row["hcc_v28_code"].strip() if row.get("hcc_v28_code") else None,
                            hcc_v28_label=row["hcc_v28_label"].strip() if row.get("hcc_v28_label") else None,
                        )
                    )

        # 2. HCC Factors & Hierarchy
        hcc_path = self.root_dir / "hcc_coefficients.csv"
        if hcc_path.exists():
            with open(hcc_path, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    supersedes = [
                        s.strip()
                        for s in row.get("hierarchy_supersedes", "").split(";")
                        if s.strip()
                    ]
                    self.hcc_factors.append(
                        HCCFactor(
                            hcc_v28_code=row["hcc_v28_code"].strip(),
                            hcc_v28_label=row["hcc_v28_label"].strip(),
                            coeff_community_nondual_aged=float(row["coeff_community_nondual_aged"] or 0.0),
                            coeff_community_fbdual_aged=float(row["coeff_community_fbdual_aged"] or 0.0),
                            hierarchy_supersedes=supersedes,
                        )
                    )

        # 3. Demographic Factors
        demo_path = self.root_dir / "demographic_coefficients.csv"
        if demo_path.exists():
            with open(demo_path, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self.demographic_factors.append(
                        DemographicFactor(
                            sex=row["sex"].strip().upper(),
                            age_band=row["age_band"].strip(),
                            coeff_community_nondual_aged=float(row["coeff_community_nondual_aged"] or 0.0),
                            coeff_community_fbdual_aged=float(row["coeff_community_fbdual_aged"] or 0.0),
                        )
                    )

        # 4. Patients
        patients_path = self.root_dir / "patients.json"
        if patients_path.exists():
            with open(patients_path, mode="r", encoding="utf-8") as f:
                data = json.load(f)
                raw_patients = data.get("patients", [])
                for p in raw_patients:
                    self.patients.append(Patient(**p))

    def _get_age_band(self, age: int) -> str:
        if age < 65:
            return "65-69"
        elif age <= 69:
            return "65-69"
        elif age <= 74:
            return "70-74"
        elif age <= 79:
            return "75-79"
        elif age <= 84:
            return "80-84"
        elif age <= 89:
            return "85-89"
        else:
            return "90-94"

    def lookup_condition_code(self, code_or_query: str) -> Dict[str, Any]:
        normalized = code_or_query.strip().upper().replace(" ", "")
        undotted = normalized.replace(".", "")

        # Exact match check
        for c in self.condition_codes:
            c_undotted = c.icd10_code.replace(".", "").upper()
            if c.icd10_code.upper() == normalized or c_undotted == undotted:
                return {
                    "dataset_version": DATASET_VERSION,
                    "code": c.icd10_code,
                    "description": c.description,
                    "code_family": c.code_family,
                    "chapter": c.chapter,
                    "chronic": c.chronic,
                    "specificity": c.specificity,
                    "maps_to_hcc": bool(c.hcc_v28_code),
                    "hcc_v28_code": c.hcc_v28_code,
                    "hcc_v28_label": c.hcc_v28_label or "None (Does not map to CMS-HCC V28 payment model)",
                }

        # Substring / keyword search
        q = code_or_query.lower().strip()
        matches = [
            c for c in self.condition_codes
            if q in c.description.lower() or q in c.icd10_code.lower() or q in c.code_family.lower()
        ][:5]

        if matches:
            return {
                "dataset_version": DATASET_VERSION,
                "matched_count": len(matches),
                "results": [
                    {
                        "code": c.icd10_code,
                        "description": c.description,
                        "chronic": c.chronic,
                        "specificity": c.specificity,
                        "maps_to_hcc": bool(c.hcc_v28_code),
                        "hcc_v28_code": c.hcc_v28_code,
                        "hcc_v28_label": c.hcc_v28_label or "None",
                    }
                    for c in matches
                ],
            }

        return {
            "dataset_version": DATASET_VERSION,
            "error": f'No condition code or diagnosis found matching "{code_or_query}" in {DATASET_VERSION}.',
        }

    def calculate_risk_score(
        self,
        org_slug: str,
        patient_id: Optional[str] = None,
        icd10_codes: Optional[List[str]] = None,
        sex: str = "F",
        age: int = 75,
        model_segment: str = "community_nondual_aged",
        base_rate: float = DEFAULT_BASE_RATE,
    ) -> Dict[str, Any]:
        codes = icd10_codes or []
        eval_sex = sex.upper()
        eval_age = age
        eval_segment = model_segment

        # If patient_id supplied, strictly enforce tenant boundary
        if patient_id:
            patient = next(
                (p for p in self.patients if p.patient_id.upper() == patient_id.strip().upper()),
                None,
            )
            if not patient:
                return {"error": f"Patient ID {patient_id} not found."}
            if patient.org_slug != org_slug:
                return {
                    "error": f"Security Violation: Patient {patient_id} does not belong to your organization ({org_slug}). Access denied."
                }
            eval_sex = patient.sex
            eval_age = patient.age
            eval_segment = patient.enrollment.model_segment
            if not codes:
                codes = [c.icd10_code for c in patient.documented_conditions_2026]

        # Step 1: Map codes to HCC
        mapped_raw: List[Dict[str, Any]] = []
        unmapped_list: List[UnmappedConditionResult] = []

        for raw_code in codes:
            clean_undotted = raw_code.strip().upper().replace(".", "")
            found = next(
                (c for c in self.condition_codes if c.icd10_code.replace(".", "").upper() == clean_undotted),
                None,
            )

            if not found:
                unmapped_list.append(
                    UnmappedConditionResult(
                        icd10_code=raw_code,
                        description="Code not present in seed dataset",
                        reason=f"Unknown ICD-10 code in {DATASET_VERSION}",
                    )
                )
                continue

            if not found.hcc_v28_code:
                unmapped_list.append(
                    UnmappedConditionResult(
                        icd10_code=found.icd10_code,
                        description=found.description,
                        reason="Does not map to CMS-HCC V28 payment category (0 coefficient)",
                    )
                )
                continue

            factor = next((h for h in self.hcc_factors if h.hcc_v28_code == found.hcc_v28_code), None)
            raw_coeff = (
                factor.coeff_community_fbdual_aged
                if eval_segment == "community_fbdual_aged" and factor
                else (factor.coeff_community_nondual_aged if factor else 0.0)
            )

            mapped_raw.append(
                {
                    "icd10_code": found.icd10_code,
                    "description": found.description,
                    "hcc_code": found.hcc_v28_code,
                    "hcc_label": found.hcc_v28_label or (factor.hcc_v28_label if factor else ""),
                    "raw_coefficient": raw_coeff,
                }
            )

        # Step 2: De-duplicate by HCC code
        unique_hcc_map: Dict[str, Dict[str, Any]] = {}
        for item in mapped_raw:
            h_code = item["hcc_code"]
            if h_code not in unique_hcc_map:
                unique_hcc_map[h_code] = item

        # Step 3: Apply hierarchy supersession
        active_hccs = set(unique_hcc_map.keys())
        superseded_map: Dict[str, str] = {}  # suppressed_hcc -> superseding_hcc

        for h_code in active_hccs:
            factor = next((h for h in self.hcc_factors if h.hcc_v28_code == h_code), None)
            if factor and factor.hierarchy_supersedes:
                for suppressed_code in factor.hierarchy_supersedes:
                    if suppressed_code in active_hccs:
                        superseded_map[suppressed_code] = h_code

        final_mapped: List[MappedConditionResult] = []
        for h_code, item in unique_hcc_map.items():
            is_sup = h_code in superseded_map
            sup_by = superseded_map.get(h_code)
            final_coeff = 0.0 if is_sup else item["raw_coefficient"]
            final_mapped.append(
                MappedConditionResult(
                    icd10_code=item["icd10_code"],
                    description=item["description"],
                    hcc_code=h_code,
                    hcc_label=item["hcc_label"],
                    raw_coefficient=item["raw_coefficient"],
                    is_superseded=is_sup,
                    superseded_by=f"HCC {sup_by}" if sup_by else None,
                    final_coefficient=round(final_coeff, 3),
                )
            )

        hcc_sum = round(sum(m.final_coefficient for m in final_mapped), 3)

        # Step 4: Demographic Factor
        age_band = self._get_age_band(eval_age)
        demo_record = next(
            (d for d in self.demographic_factors if d.sex == eval_sex and d.age_band == age_band),
            None,
        )
        demo_coeff = (
            demo_record.coeff_community_fbdual_aged
            if eval_segment == "community_fbdual_aged" and demo_record
            else (demo_record.coeff_community_nondual_aged if demo_record else 0.386)
        )
        demo_coeff = round(demo_coeff, 3)

        # Step 5: RAF Total
        raf_total = round(demo_coeff + hcc_sum, 3)

        # Step 6: Estimated Annual Payment
        annual_payment = round(raf_total * base_rate)

        result = RAFCalculationResult(
            patient_id=patient_id,
            org_slug=org_slug,
            dataset_version=DATASET_VERSION,
            model_segment=eval_segment,
            demographic_factor=DemographicFactorResult(
                sex="F" if eval_sex == "F" else "M",
                age_band=age_band,
                coefficient=demo_coeff,
            ),
            mapped_conditions=final_mapped,
            unmapped_conditions=unmapped_list,
            demographic_coefficient=demo_coeff,
            hcc_coefficient_sum=hcc_sum,
            raf_total=raf_total,
            base_rate=base_rate,
            estimated_annual_payment=annual_payment,
        )
        return result.model_dump()

    def get_patient_risk_profile(self, org_slug: str, patient_id: str) -> Dict[str, Any]:
        patient = next(
            (p for p in self.patients if p.patient_id.upper() == patient_id.strip().upper()),
            None,
        )

        if not patient:
            return {
                "dataset_version": DATASET_VERSION,
                "error": f'Patient "{patient_id}" not found in system of record.',
            }

        # Tenant boundary check
        if patient.org_slug != org_slug:
            return {
                "dataset_version": DATASET_VERSION,
                "error": f'Patient "{patient_id}" not found in organization "{org_slug}". (Strict Tenant Isolation Enforced: records from other organizations are invisible).',
            }

        # Current Documented RAF
        doc_codes = [c.icd10_code for c in patient.documented_conditions_2026]
        current_raf = self.calculate_risk_score(org_slug=org_slug, patient_id=patient.patient_id, icd10_codes=doc_codes)

        # Potential RAF including suspected care gaps
        all_codes = doc_codes + [c.icd10_code for c in patient.suspected_conditions]
        potential_raf = self.calculate_risk_score(org_slug=org_slug, patient_id=patient.patient_id, icd10_codes=all_codes)

        current_val = current_raf.get("raf_total") if "raf_total" in current_raf else None
        potential_val = potential_raf.get("raf_total") if "raf_total" in potential_raf else None
        financial_gap = (
            potential_raf.get("estimated_annual_payment", 0) - current_raf.get("estimated_annual_payment", 0)
            if "estimated_annual_payment" in potential_raf and "estimated_annual_payment" in current_raf
            else 0
        )

        pt_dict = patient.model_dump()
        pt_dict["raf_analysis"] = {
            "current_documented": current_val,
            "potential_with_suspected": potential_val,
            "annual_financial_gap": financial_gap,
        }

        return {
            "dataset_version": DATASET_VERSION,
            "patient": pt_dict,
        }

clinical_engine = ClinicalEngine(settings.DATA_DIR)
