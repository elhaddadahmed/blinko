
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("blinko_connection_test")
    .select("message")
    .limit(1);

  if (error) {
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    connected: true,
    message: data?.[0]?.message ?? "Verbindung erfolgreich"
  });
}
