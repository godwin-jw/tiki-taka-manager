"use client";

// Root layout failures (including database/session failures) need their own document.
export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="tr"><body style={{ margin: 0, background: "#09090b", color: "#fafafa", fontFamily: "Arial, sans-serif" }}><main style={{ maxWidth: 520, margin: "15vh auto", padding: 32 }}><p style={{ color: "#34d399", letterSpacing: 3, fontSize: 12 }}>TIKI-TAKA MANAGER</p><h1>Kulüp merkezine bağlanılamadı.</h1><p style={{ color: "#a1a1aa", lineHeight: 1.7 }}>Geçici bir bağlantı sorunu olabilir. Biraz sonra tekrar deneyin. Sorun devam ederse platform yöneticisiyle iletişime geçin.</p><button onClick={reset} style={{ background: "#34d399", color: "#09090b", border: 0, padding: "12px 20px", borderRadius: 8, cursor: "pointer" }}>Tekrar dene</button></main></body></html>;
}