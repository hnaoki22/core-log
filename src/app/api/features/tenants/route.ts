// GET /api/features/tenants?token=xxx
// Admin-only (super admin)
// Returns list of all tenants
// POST to create new tenant: { token, name, slug, companyName }
// Uses existing createTenant, getAllTenants from supabase.ts

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { isAdminTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-g.multiTenant", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Multi-tenant feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify super-admin token
    const isAdmin = await isAdminTokenFromSupabase(token);
    if (!isAdmin) {
      return NextResponse.json({ error: "Super-admin access required" }, { status: 403 });
    }

    // Fetch all tenants
    const client = getClient();
    const { data, error } = await client
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Tenants fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch tenants" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tenants: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Tenants GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, name, slug, companyName } = body;

    if (!token || !name || !slug || !companyName) {
      return NextResponse.json(
        { error: "Token, name, slug, and companyName are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-g.multiTenant", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Multi-tenant feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify super-admin token
    const isAdmin = await isAdminTokenFromSupabase(token);
    if (!isAdmin) {
      return NextResponse.json({ error: "Super-admin access required" }, { status: 403 });
    }

    // Create new tenant
    const client = getClient();
    const { data, error } = await client
      .from("tenants")
      .insert({
        name,
        slug,
        company_name: companyName,
        created_at: new Date().toISOString(),
      })
      .select("id, name, slug, company_name")
      .single();

    if (error || !data) {
      console.error("Tenant creation error:", error);
      return NextResponse.json(
        { error: "Failed to create tenant" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tenant: data,
      tenantId: data.id,
    });
  } catch (error) {
    console.error("Tenants POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
