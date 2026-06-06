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
      style: { stroke: entry.result === "fail" ? "#ef4444" : "#d1d5db" },
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
        labelStyle: { fontSize: 9, fill: "#6366f1" },
      });
    }
  });

  return { nodes, edges };
}

// Custom node types
function TransactionNode({ data }: { data: { label: string } }) {
  return (
    <div className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg shadow">
      {data.label}
      <Handle type="source" position={Position.Right} className="!bg-indigo-300" />
    </div>
  );
}

function RuleNode({ data }: { data: { label: string; section: string; description: string } }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs max-w-[220px]">
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
      <div className="font-mono text-indigo-600 font-semibold">{data.label}</div>
      <div className="text-gray-400 mt-0.5">{data.section}</div>
      <div className="text-gray-600 mt-1 line-clamp-2">{data.description}</div>
      <Handle type="source" position={Position.Right} className="!bg-gray-300" />
    </div>
  );
}

function ViolationNode({
  data,
}: {
  data: { label: string; section: string; violation_message?: string; snapshot: Record<string, unknown> };
}) {
  return (
    <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-2 shadow-sm text-xs max-w-[240px]">
      <Handle type="target" position={Position.Left} className="!bg-red-300" />
      <div className="font-mono text-red-600 font-semibold">{data.label}</div>
      <div className="text-red-400 mt-0.5">{data.section}</div>
      {data.violation_message && (
        <div className="text-red-700 mt-1 font-medium">{data.violation_message}</div>
      )}
      {Object.keys(data.snapshot).length > 0 && (
        <div className="mt-2 bg-red-100 rounded p-1 font-mono text-red-800 text-[10px]">
          {Object.entries(data.snapshot).map(([k, v]) => (
            <div key={k}>{k}: {String(v)}</div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-red-300" />
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
        <Background gap={20} color="#f0f0f0" />
        <Controls />
        <MiniMap nodeColor={(n) => (n.type === "violationNode" ? "#fca5a5" : "#e0e7ff")} />
      </ReactFlow>
    </div>
  );
}
