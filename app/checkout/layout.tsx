import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete Payment — Estimate Nepal",
  description: "Complete your payment to activate your Estimate Nepal plan. Scan the QR code, pay via eSewa or Khalti, then notify us on WhatsApp.",
  alternates: { canonical: "https://estimatenepal.com/checkout" },
  robots: { index: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
