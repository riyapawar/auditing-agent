import { NextResponse } from "next/server";
import { loadTransactions } from "@/lib/db";

export async function GET() {
  try {
    const data = loadTransactions();
    if (data.length === 0) {
      return NextResponse.json([], { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to read transactions" }, { status: 500 });
  }
}
