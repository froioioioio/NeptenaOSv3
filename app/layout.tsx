import type { Metadata, Viewport } from 'next';
import './globals.css'; // Global styles

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#020617',
};

export const metadata: Metadata = {
  title: 'Neptena-OS | AI Mission Control & Startup Operating System',
  description: 'Personal AI Mission Control / Startup Operating System CEO orchestrator.',
  openGraph: {
    title: 'Neptena-OS | AI Mission Control',
    description: 'Personal AI Mission Control / Startup Operating System CEO orchestrator.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Neptena-OS | AI Mission Control',
    description: 'Personal AI Mission Control / Startup Operating System CEO orchestrator.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-slate-950 text-slate-100">
      <body className="bg-slate-950 text-slate-100 min-h-screen w-full overflow-x-hidden antialiased selection:bg-cyan-500/30 selection:text-cyan-200" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
