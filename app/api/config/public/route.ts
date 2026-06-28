import { NextResponse } from "next/server";
import { getAllConfigs } from "@/lib/config";

// Returns only the subset of config values safe to expose publicly
// (no maintenance_mode, registration_enabled — those are internal flags)
export async function GET() {
  try {
    const cfg = await getAllConfigs();
    return NextResponse.json({
      trialDays: parseInt(cfg.trial_days, 10) || 14,
      priceSoloMonthly: parseInt(cfg.price_solo_monthly, 10) || 999,
      priceTeam3Monthly: parseInt(cfg.price_team3_monthly, 10) || 1999,
      priceTeam5Monthly: parseInt(cfg.price_team5_monthly, 10) || 3000,
      pricePerSeatEnterprise: parseInt(cfg.price_per_seat_enterprise, 10) || 550,
      annualFreeMonths: parseInt(cfg.annual_free_months, 10) || 2,
      contactEmail: cfg.contact_email,
      contactWhatsapp: cfg.contact_whatsapp,
      whatsappMessage: cfg.whatsapp_message,
      paymentQrUrl: cfg.payment_qr_url ?? "",
    });
  } catch {
    // Return safe defaults if config is unavailable
    return NextResponse.json({
      trialDays: 14,
      priceSoloMonthly: 999,
      priceTeam3Monthly: 1999,
      priceTeam5Monthly: 3000,
      pricePerSeatEnterprise: 550,
      annualFreeMonths: 2,
      contactEmail: "hello@estimatenepal.com",
      contactWhatsapp: "+977XXXXXXXXX",
      whatsappMessage: "Hi, I am interested in Estimate Nepal. Please share pricing details.",
      paymentQrUrl: "",
    });
  }
}
