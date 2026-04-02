import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js/cors";

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("META_ADS_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "META_ADS_ACCESS_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ad_account_id, date_preset } = await req.json();
    if (!ad_account_id) {
      return new Response(JSON.stringify({ error: "ad_account_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountId = ad_account_id.startsWith("act_") ? ad_account_id : `act_${ad_account_id}`;
    const preset = date_preset || "last_30d";

    // Fetch account-level insights
    const fields = "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,reach,frequency";
    const insightsUrl = `${META_BASE}/${accountId}/insights?fields=${fields}&date_preset=${preset}&access_token=${token}`;

    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();

    if (insightsData.error) {
      return new Response(JSON.stringify({ error: insightsData.error.message, meta_error: insightsData.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign-level breakdown
    const campaignFields = "campaign_name,spend,impressions,clicks,ctr,actions,cost_per_action_type";
    const campaignUrl = `${META_BASE}/${accountId}/insights?fields=${campaignFields}&date_preset=${preset}&level=campaign&limit=20&access_token=${token}`;

    const campaignRes = await fetch(campaignUrl);
    const campaignData = await campaignRes.json();

    // Fetch daily breakdown for chart
    const dailyUrl = `${META_BASE}/${accountId}/insights?fields=spend,impressions,clicks,actions&date_preset=${preset}&time_increment=1&access_token=${token}`;
    const dailyRes = await fetch(dailyUrl);
    const dailyData = await dailyRes.json();

    // Parse results helper
    const parseInsight = (row: any) => {
      const actions = row.actions || [];
      const costPerAction = row.cost_per_action_type || [];
      const leads = actions.find((a: any) => a.action_type === "lead")?.value || 0;
      const purchases = actions.find((a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase")?.value || 0;
      const conversions = actions.find((a: any) => a.action_type === "offsite_conversion" || a.action_type === "lead" || a.action_type === "purchase")?.value || 0;
      const cpa = costPerAction.find((a: any) => a.action_type === "lead" || a.action_type === "purchase")?.value || null;

      return {
        spend: parseFloat(row.spend || "0"),
        impressions: parseInt(row.impressions || "0"),
        clicks: parseInt(row.clicks || "0"),
        ctr: parseFloat(row.ctr || "0"),
        cpc: parseFloat(row.cpc || "0"),
        cpm: parseFloat(row.cpm || "0"),
        reach: parseInt(row.reach || "0"),
        frequency: parseFloat(row.frequency || "0"),
        leads: parseInt(leads),
        purchases: parseInt(purchases),
        conversions: parseInt(conversions),
        cpa: cpa ? parseFloat(cpa) : null,
      };
    };

    const summary = insightsData.data?.length > 0 ? parseInsight(insightsData.data[0]) : null;

    const campaigns = (campaignData.data || []).map((c: any) => ({
      name: c.campaign_name,
      ...parseInsight(c),
    }));

    const daily = (dailyData.data || []).map((d: any) => ({
      date: d.date_start,
      spend: parseFloat(d.spend || "0"),
      impressions: parseInt(d.impressions || "0"),
      clicks: parseInt(d.clicks || "0"),
      leads: parseInt((d.actions || []).find((a: any) => a.action_type === "lead")?.value || "0"),
    }));

    return new Response(JSON.stringify({ summary, campaigns, daily }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Meta Ads error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
