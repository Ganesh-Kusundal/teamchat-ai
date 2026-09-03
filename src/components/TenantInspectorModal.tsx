import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  ShieldAlert,
  Search,
  Calculator,
  Database,
  Cpu,
  CheckCircle,
  AlertTriangle,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { RAFCalculationResult } from '../types.js';

interface TenantInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TenantInspectorModal: React.FC<TenantInspectorModalProps> = ({ isOpen, onClose }) => {
  const { organization, token, allOrganizations, switchOrganization } = useAuth();
  const [activeTab, setActiveTab] = useState<'isolation' | 'raf' | 'architecture'>('isolation');

  // Isolation test state
  const [testPatientId, setTestPatientId] = useState('PT-4001');
  const [patientLookupResult, setPatientLookupResult] = useState<any>(null);
  const [patientLookupLoading, setPatientLookupLoading] = useState(false);

  const [memoryKey, setMemoryKey] = useState('q1_recapture_target');
  const [memoryResult, setMemoryResult] = useState<any>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);

  // RAF Calculator state
  const [rafCodesInput, setRafCodesInput] = useState('E11.22, N18.4, I50.32');
  const [rafBaseRate, setRafBaseRate] = useState<number>(12000);
  const [rafResult, setRafResult] = useState<RAFCalculationResult | null>(null);
  const [rafLoading, setRafLoading] = useState(false);

  if (!isOpen) return null;

  // Run Patient Isolation Test
  const testPatientLookup = async (pId: string) => {
    setPatientLookupLoading(true);
    setPatientLookupResult(null);
    try {
      const res = await fetch(`/api/patients/${pId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPatientLookupResult(data);
    } catch (err: any) {
      setPatientLookupResult({ error: err.message });
    } finally {
      setPatientLookupLoading(false);
    }
  };

  // Run Memory Isolation Test
  const testMemoryLookup = async () => {
    setMemoryLoading(true);
    setMemoryResult(null);
    try {
      const res = await fetch(`/api/memories?q=${encodeURIComponent(memoryKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMemoryResult(data);
    } catch (err: any) {
      setMemoryResult({ error: err.message });
    } finally {
      setMemoryLoading(false);
    }
  };

  // Run Live RAF Calculation
  const runRafCalculation = async () => {
    setRafLoading(true);
    setRafResult(null);
    try {
      const codes = rafCodesInput
        .split(/[,\s]+/)
        .map((c) => c.trim())
        .filter(Boolean);
      const res = await fetch('/api/tools/calculate-raf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          icd10Codes: codes,
          baseRate: rafBaseRate,
        }),
      });
      const data = await res.json();
      setRafResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setRafLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#18181B] border border-white/10 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-white/5 flex items-center justify-between bg-[#18181B]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>Multi-Tenant & Clinical Intelligence Inspector</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {organization?.slug}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Staff/Principal Engineer Verification Tool: Tenant Boundaries, Memory & RAF Model
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 bg-[#18181B] px-6">
          <button
            onClick={() => setActiveTab('isolation')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'isolation'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Tenant Isolation Proof</span>
          </button>
          <button
            onClick={() => setActiveTab('raf')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'raf'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Interactive RAF Calculator</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'architecture'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>System Architecture</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0F0F11]">
          {/* TAB 1: TENANT ISOLATION PROOF */}
          {activeTab === 'isolation' && (
            <div className="space-y-6 text-xs">
              <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-indigo-200 leading-relaxed">
                <strong>How Tenant Isolation Is Enforced:</strong> All server-side data stores,
                memories, chat rooms, and clinical patient profiles partition exclusively on{' '}
                <code className="bg-indigo-500/20 px-1 py-0.5 rounded text-indigo-300 font-mono">orgSlug</code>.
                Tool parameters can NEVER override the session identity.
              </div>

              {/* Test 1: Cross-Tenant Patient Access */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Search className="w-4 h-4 text-indigo-400" />
                    <span>Test 1: Cross-Tenant Patient PHI Boundary</span>
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setTestPatientId('PT-4001');
                        testPatientLookup('PT-4001');
                      }}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-[11px] text-zinc-300 transition-colors border border-white/5"
                    >
                      PT-4001 (Northside)
                    </button>
                    <button
                      onClick={() => {
                        setTestPatientId('PT-4013');
                        testPatientLookup('PT-4013');
                      }}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-[11px] text-zinc-300 transition-colors border border-white/5"
                    >
                      PT-4013 (Valley)
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testPatientId}
                    onChange={(e) => setTestPatientId(e.target.value)}
                    placeholder="Enter Patient ID (e.g. PT-4001 or PT-4013)"
                    className="flex-1 bg-[#0F0F11] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    onClick={() => testPatientLookup(testPatientId)}
                    disabled={patientLookupLoading}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {patientLookupLoading ? 'Checking...' : 'Execute Test'}
                  </button>
                </div>

                {patientLookupResult && (
                  <div
                    className={`p-3 rounded-lg border font-mono text-[11px] ${
                      patientLookupResult.error
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                        : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                    }`}
                  >
                    {patientLookupResult.error ? (
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Isolation Protected:</strong>
                          <div>{patientLookupResult.error}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Access Granted within Tenant:</strong>
                          <div>
                            Patient: {patientLookupResult.patient.name} ({patientLookupResult.patient.patient_id}) ·{' '}
                            {patientLookupResult.patient.age}yo {patientLookupResult.patient.sex}
                          </div>
                          <div>Attending: {patientLookupResult.patient.attending_provider}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Test 2: Shared Key Memory Isolation */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span>Test 2: Shared Memory Key Partitioning</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    Key: <code className="text-indigo-300">q1_recapture_target</code>
                  </span>
                </div>
                <p className="text-zinc-400 text-xs">
                  Both Northside and Valley use the exact same key{' '}
                  <code className="text-zinc-300 font-mono">q1_recapture_target</code>, but Northside has{' '}
                  <strong className="text-white">92%</strong> and Valley has{' '}
                  <strong className="text-white">85%</strong>.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={testMemoryLookup}
                    disabled={memoryLoading}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {memoryLoading ? 'Recalling...' : 'Query Current Tenant Memory'}
                  </button>

                  <div className="text-xs text-zinc-400">
                    Current Tenant: <strong className="text-indigo-300">{organization?.name}</strong>
                  </div>
                </div>

                {memoryResult && (
                  <pre className="p-3 rounded-lg bg-[#0F0F11] border border-white/10 text-[11px] text-indigo-200 overflow-x-auto font-mono">
                    {JSON.stringify(memoryResult, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE RAF CALCULATOR */}
          {activeTab === 'raf' && (
            <div className="space-y-5 text-xs">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <h3 className="font-semibold text-white text-sm">
                  CMS-HCC V28 Clinical RAF Calculation Engine
                </h3>
                <p className="text-zinc-400">
                  Calculates demographic factors + ICD-10 to HCC mapping + hierarchy supersession
                  rules (e.g. Heart Failure HCC 36 supersedes 37; Diabetes HCC 17 supersedes 18, 19,
                  20, 22, 23).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 mb-1">ICD-10 Diagnosis Codes (comma separated):</label>
                    <input
                      type="text"
                      value={rafCodesInput}
                      onChange={(e) => setRafCodesInput(e.target.value)}
                      className="w-full bg-[#0F0F11] border border-white/10 rounded-lg px-3 py-1.5 text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Base Rate ($ per 1.0 RAF):</label>
                    <input
                      type="number"
                      value={rafBaseRate}
                      onChange={(e) => setRafBaseRate(Number(e.target.value))}
                      className="w-full bg-[#0F0F11] border border-white/10 rounded-lg px-3 py-1.5 text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={runRafCalculation}
                    disabled={rafLoading}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {rafLoading ? 'Calculating...' : 'Run RAF Calculation'}
                  </button>
                  <button
                    onClick={() => setRafCodesInput('I50.32, I50.9, I10, E11.22, N18.4')}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-zinc-300 transition-colors"
                  >
                    Preset: HF + CKD + DM (Hierarchy Test)
                  </button>
                </div>
              </div>

              {/* RAF Results Breakdown */}
              {rafResult && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-[#0F0F11] rounded-lg border border-white/5">
                      <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Demographic Weight</div>
                      <div className="text-lg font-bold text-white font-mono">
                        {rafResult.demographic_coefficient}
                      </div>
                    </div>
                    <div className="p-3 bg-[#0F0F11] rounded-lg border border-white/5">
                      <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">HCC Disease Sum</div>
                      <div className="text-lg font-bold text-white font-mono">
                        {rafResult.hcc_coefficient_sum}
                      </div>
                    </div>
                    <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                      <div className="text-indigo-400 text-[10px] uppercase font-bold tracking-wider">Total RAF Score</div>
                      <div className="text-lg font-bold text-indigo-300 font-mono">{rafResult.raf_total}</div>
                    </div>
                    <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <div className="text-emerald-400 text-[10px] uppercase font-bold tracking-wider">Estimated Payment</div>
                      <div className="text-lg font-bold text-emerald-300 font-mono">
                        ${rafResult.estimated_annual_payment.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Conditions Table */}
                  <div>
                    <h4 className="font-semibold text-white mb-2">Mapped CMS-HCC Conditions:</h4>
                    <div className="border border-white/5 rounded-lg overflow-hidden bg-[#0F0F11]">
                      <table className="w-full text-left">
                        <thead className="bg-white/5 text-zinc-400 text-[10px] border-b border-white/5">
                          <tr>
                            <th className="p-2">ICD-10</th>
                            <th className="p-2">Description</th>
                            <th className="p-2">HCC</th>
                            <th className="p-2">Hierarchy Status</th>
                            <th className="p-2 text-right">Coefficient</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-zinc-200 text-[11px]">
                          {rafResult.mapped_conditions.map((c, i) => (
                            <tr key={i} className={c.is_superseded ? 'opacity-50 line-through' : ''}>
                              <td className="p-2 font-mono font-medium text-white">{c.icd10_code}</td>
                              <td className="p-2">{c.description}</td>
                              <td className="p-2 font-mono text-zinc-400">HCC {c.hcc_code}</td>
                              <td className="p-2">
                                {c.is_superseded ? (
                                  <span className="text-amber-400">Superseded by {c.superseded_by}</span>
                                ) : (
                                  <span className="text-emerald-400">Active</span>
                                )}
                              </td>
                              <td className="p-2 text-right font-mono font-bold text-white">
                                {c.final_coefficient.toFixed(3)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Unmapped Conditions */}
                  {rafResult.unmapped_conditions.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200">
                      <strong>Unmapped ICD-10 Codes (0 RAF contribution):</strong>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5">
                        {rafResult.unmapped_conditions.map((u, i) => (
                          <li key={i}>
                            <code className="font-mono">{u.icd10_code}</code> ({u.description}): {u.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SYSTEM ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <h3 className="font-semibold text-white text-sm">
                  1. Multi-Tenant Distributed Architecture
                </h3>
                <p>
                  Every request carries an authenticated session token resolved to a specific{' '}
                  <code className="text-indigo-300 font-mono">orgSlug</code>. Room records, message logs, and
                  clinical tools strictly scope their queries to that slug. Cross-tenant leakage is
                  structurally prohibited at the service layer.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <h3 className="font-semibold text-white text-sm">
                  2. Real-Time Collaboration & SSE Streaming
                </h3>
                <p>
                  Built on high-performance Server-Sent Events (SSE) with persistent client connection
                  pools. When any user sends a message or invokes Gemini AI, all clients in that room
                  receive real-time token chunks, typing indicators, and presence updates with
                  sub-50ms latency.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <h3 className="font-semibold text-white text-sm">
                  3. User Attribution & Gemini Context Pipeline
                </h3>
                <p>
                  Unlike naive chatbots, TeamChat AI injects full multi-participant attribution:
                  <pre className="bg-[#0F0F11] border border-white/5 p-3 rounded text-[10px] text-indigo-200 mt-2 font-mono">
{`[14:32] Sarah: We need to decide on the caching strategy
[14:32] Mike: I'm thinking Redis, but worried about costs
[14:33] Sarah: @Gemini what do you recommend?
---
Multiple team members are participating: Sarah, Mike. Address them by name.`}
                  </pre>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-[#18181B] flex items-center justify-between text-xs text-zinc-500">
          <div>Dataset Version: teamchat-seed-2026.1</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 font-medium transition-colors border border-white/5"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
