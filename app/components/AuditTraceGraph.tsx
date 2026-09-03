"use client";

import { useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import type { AuditLogEntry, AuditRule } from "@/lib/types";

// Build React Flow nodes/edges from audit log entries for one transaction
function buildGraph(entries: AuditLogEntry[], rules: AuditRule[], transactionId: string) {
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const relevant = entries.filter(
    (e) => e.transaction_id === transactionId && e.result !== "skip"
  );

  const nodes: Node[] = [
    {
      id: `tx-${transactionId}`,
      type: "transactionNode",
      position: { x: 0, y: 0 },
      data: { label: `Transaction ${transactionId}` },
    },
  ];

  const edges: Edge[] = [];
  const cols = new Map<number, number>(); // depth → count, for layout

  relevant.forEach((entry, i) => {
    const rule = ruleMap.get(entry.rule_id);
    const col = i % 3;
    const row = Math.floor(i / 3);
    cols.set(col, (cols.get(col) ?? 0) + 1);

    nodes.push({
      id: `rule-${entry.rule_id}`,
      type: entry.result === "fail" ? "violationNode" : "ruleNode",
      position: { x: 280 + col * 280, y: 100 + row * 140 },
      data: {
        label: entry.rule_id,
        section: rule?.section ?? "",
        description: rule?.description ?? entry.violation_message ?? "",
        result: entry.result,
        violation_message: entry.violation_message,
        snapshot: entry.input_snapshot,
      },
    });

    edges.push({
      id: `e-tx-${entry.rule_id}`,
      source: `tx-${transactionId}`,
      target: `rule-${entry.rule_id}`,
      type: "smoothstep",
      animated: entry.result === "fail",
      style: { stroke: entry.result === "fail" ? "#f43f5e" : "#334155" },
    });

    // Dependency edges
    for (const dep of rule?.depends_on ?? []) {
      edges.push({
        id: `dep-${dep}-${entry.rule_id}`,
        source: `rule-${dep}`,
        target: `rule-${entry.rule_id}`,
        type: "smoothstep",
        label: "depends on",
        style: { stroke: "#6366f1", strokeDasharray: "4 4" },
        labelStyle: { fontSize: 9, fill: "#818cf8" },
      });
    }
  });

  return { nodes, edges };
}

// Custom node types
function TransactionNode({ data }: { data: { label: string } }) {
  return (
    <div className="bg-indigo-600 text-white text-xs font-semibold px-4 py-2.5 rounded-lg border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
      {data.label}
      <Handle type="source" position={Position.Right} className="!bg-indigo-400 !w-2 !h-2" />
    </div>
  );
}

function RuleNode({ data }: { data: { label: string; section: string; description: string } }) {
  return (
    <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-3 shadow-xl text-xs max-w-[240px]">
      <Handle type="target" position={Position.Left} className="!bg-slate-700 !w-2 !h-2" />
      <div className="font-mono text-indigo-400 font-bold text-[11px]">{data.label}</div>
      <div className="text-slate-500 mt-0.5 font-mono text-[9px] uppercase tracking-wider font-semibold">§ {data.section}</div>
      <div className="text-slate-350 mt-2 leading-relaxed font-sans line-clamp-3">{data.description}</div>
      <Handle type="source" position={Position.Right} className="!bg-slate-700 !w-2 !h-2" />
    </div>
  );
}

function ViolationNode({
  data,
}: {
  data: { label: string; section: string; violation_message?: string; snapshot: Record<string, unknown> };
}) {
  return (
    <div className="bg-slate-950 border border-rose-900/60 rounded-xl px-4 py-3 shadow-xl text-xs max-w-[260px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-rose-500" />
      <Handle type="target" position={Position.Left} className="!bg-rose-800 !w-2 !h-2" />
      <div className="font-mono text-rose-400 font-bold text-[11px]">{data.label}</div>
      <div className="text-slate-500 mt-0.5 font-mono text-[9px] uppercase tracking-wider font-semibold">§ {data.section}</div>
      {data.violation_message && (
        <div className="text-rose-350 mt-2 font-medium leading-relaxed font-sans">{data.violation_message}</div>
      )}
      {Object.keys(data.snapshot).length > 0 && (
        <div className="mt-3 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-slate-400 text-[10px] space-y-0.5">
          {Object.entries(data.snapshot).map(([k, v]) => (
            <div key={k} className="truncate"><span className="text-slate-650">{k}:</span> {String(v)}</div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-rose-800 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = {
  transactionNode: TransactionNode,
  ruleNode: RuleNode,
  violationNode: ViolationNode,
};

interface Props {
  entries: AuditLogEntry[];
  rules: AuditRule[];
  transactionId: string;
}

export function AuditTraceGraph({ entries, rules, transactionId }: Props) {
  const { nodes: initialNodes, edges: initialEdges } = buildGraph(entries, rules, transactionId);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(() => {}, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#1e293b" />
        <Controls className="!bg-slate-900 !border-slate-800 [&_button]:!bg-slate-900 [&_button]:!border-slate-800 [&_svg]:!fill-slate-400" />
        <MiniMap 
          style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}
          nodeColor={(n) => (n.type === "violationNode" ? "#f43f5e" : "#6366f1")}
          maskColor="rgba(0, 0, 0, 0.7)"
        />
      </ReactFlow>
    </div>
  );
}
