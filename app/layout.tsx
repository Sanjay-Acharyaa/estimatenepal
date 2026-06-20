import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

export const metadata: Metadata = {
  title: {
    default: "NepaliEstimate — Nepal's Smart Construction Platform",
    template: "%s | NepaliEstimate",
  },
  description: "Nepal's smart construction platform. Create accurate BOQs, manage tenders, submit bids, and collaborate with your team — all in one place.",
  keywords: ["construction estimating Nepal", "BOQ software Nepal", "quantity survey", "tender preparation", "contractor bidding", "cost estimation"],
  authors: [{ name: "NepaliEstimate" }],
  metadataBase: new URL("https://estimatenepal.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://estimatenepal.com",
    title: "NepaliEstimate — Nepal's Smart Construction Platform",
    description: "Create accurate BOQs, manage tenders, bid on projects, and collaborate with your team. Nepal's leading construction platform.",
    siteName: "NepaliEstimate",
  },
  twitter: {
    card: "summary_large_image",
    title: "NepaliEstimate — Nepal's Smart Construction Platform",
    description: "Create accurate BOQs, manage tenders, and bid on projects. Nepal's leading construction platform.",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Google Analytics (GA4) — only injected when NEXT_PUBLIC_GA_MEASUREMENT_ID is set */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}

        {/* Facebook Pixel — only injected when NEXT_PUBLIC_FB_PIXEL_ID is set */}
        {FB_PIXEL_ID && (
          <>
            <Script id="fb-pixel-init" strategy="afterInteractive">
              {`
                !function(f,b,e,v,n,t,s)
                {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)}(window, document,'script',
                'https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${FB_PIXEL_ID}');
                fbq('track', 'PageView');
              `}
            </Script>
            {/* No-JS fallback pixel */}
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        )}

        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors closeButton duration={4000} />
      </body>
    </html>
  );
}
