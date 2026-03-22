import { useState, useEffect, useRef } from "react";

declare global {
  interface Window {
    Html5Qrcode: any;
  }
}

const JAIN_RESTRICTED = [
  "onion", "onions", "spring onion", "green onion", "shallot", "shallots",
  "allium cepa", "onion powder", "onion flakes", "onion extract",
  "garlic", "garlic powder", "garlic flakes", "garlic extract", "allium sativum",
  "potato", "potatoes", "aloo", "potato starch", "potato flour", "potato flakes",
  "carrot", "carrots", "beetroot", "beet", "turnip", "radish", "mooli",
  "yam", "taro", "parsnip", "leek", "leeks", "chive", "chives",
  "meat", "beef", "pork", "chicken", "lamb", "fish", "seafood",
  "egg", "eggs", "gelatin", "gelatine", "lard", "rennet",
  "oignon", "oignons", "ail", "pomme de terre", "pommes de terre",
  "oeuf", "oeufs", "viande", "poulet", "porc", "boeuf",
  "carotte", "carottes", "poireau", "poireaux"
];

function checkIngredients(ingredientText: string) {
  if (!ingredientText) return [];
  const found = JAIN_RESTRICTED.filter((item) => {
    const regex = new RegExp(`\\b${item}\\b`, "i");
    return regex.test(ingredientText);
  });
  return [...new Set(found)];
}

async function analyzeWithClaude(ingredients: string, productName: string) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a Jain diet expert. Analyze these ingredients for "${productName}" and determine if it is safe for Jain consumption. Jain restrictions: no meat, poultry, fish, seafood, eggs, root vegetables (potato, onion, garlic, carrot, beetroot, radish, turnip, yam, taro, leek, chive, shallot), no gelatin. Also flag "may contain" warnings for any of these. Ingredients: ${ingredients}. Respond in this exact JSON format only: {"isSafe": true or false, "flaggedIngredients": ["ingredient1"], "confidence": "high"}`
        }]
      })
    });
    const data = await response.json();
    const text = data.content[0].text;
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    return null;
  }
}

async function fetchProduct(barcode: string) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    if (!data || data.status === 0 || !data.product) {
      return { error: "Product not found. Try another barcode." };
    }
    const product = data.product;
    const ingredients =
      product.ingredients_text ||
      product.ingredients_text_en ||
      product.ingredients_text_fr ||
      "Ingredients not listed";
    const name = product.product_name_en || product.product_name || "Unknown Product";
    const brand = product.brands || "";
    const flagged = checkIngredients(ingredients);
    return { name, brand, ingredients, flagged, error: null, aiAnalysis: null };
  } catch (e) {
    return { error: "Network error. Please try again." };
  }
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [result, setResult] = useState<any>(null);

  function handleResult(data: any) {
    setResult(data);
    setScreen("result");
  }

  return (
    <div style={styles.container}>
      {screen === "home" && (
        <HomeScreen onScan={() => setScreen("scanner")} onResult={handleResult} />
      )}
      {screen === "scanner" && (
        <ScannerScreen onBack={() => setScreen("home")} onResult={handleResult} />
      )}
      {screen === "result" && result && (
        <ResultScreen result={result} onBack={() => { setResult(null); setScreen("home"); }} />
      )}
    </div>
  );
}

function HomeScreen({ onScan, onResult }: any) {
  const [loadingDemo, setLoadingDemo] = useState("");

  async function handleDemo(barcode: string, label: string) {
    setLoadingDemo(label);
    const result = await fetchProduct(barcode);
    setLoadingDemo("");
    if (!result.error) onResult(result);
  }

  return (
    <div style={styles.screen}>
      <div style={styles.hero}>
        <div style={styles.logo}>🟢</div>
        <h1 style={styles.title}>JainScan</h1>
        <p style={styles.subtitle}>Scan any packaged food to instantly check if it fits your Jain diet</p>
      </div>
      <button style={styles.scanButton} onClick={onScan}>
        📷 Scan a Barcode
      </button>
      <p style={styles.hint}>Checks for onion, garlic, potato & more</p>
      <div style={styles.demoSection}>
        <p style={styles.demoLabel}>🧪 Try a demo product:</p>
        <div style={styles.demoRow}>
          {[
            { barcode: "7622210449283", label: "Oreo" },
            { barcode: "5449000000996", label: "Coca-Cola" }
          ].map(({ barcode, label }) => (
            <button
              key={label}
              style={{ ...styles.demoBtn, opacity: loadingDemo === label ? 0.6 : 1 }}
              onClick={() => handleDemo(barcode, label)}
              disabled={!!loadingDemo}
            >
              {loadingDemo === label ? "Loading..." : label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScannerScreen({ onBack, onResult }: any) {
  const [mode, setMode] = useState<"choice" | "camera" | "manual">("choice");
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef<any>(null);
  const scannerDivId = "qr-reader";

  async function processBarcode(code: string) {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (e) {}
      scannerRef.current = null;
    }
    setLoading(true);
    setError("");
    const result = await fetchProduct(code);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setMode("choice");
      return;
    }
    if (result.ingredients && result.ingredients !== "Ingredients not listed") {
      setLoadingAI(true);
      const aiAnalysis = await analyzeWithClaude(result.ingredients, result.name);
      setLoadingAI(false);
      result.aiAnalysis = aiAnalysis;
    }
    onResult(result);
  }

  useEffect(() => {
    if (mode === "camera") {
      setTimeout(() => {
        if (!window.Html5Qrcode) {
          setError("Scanner not loaded. Please use manual entry.");
          setMode("manual");
          return;
        }
        try {
          const scanner = new window.Html5Qrcode(scannerDivId);
          scannerRef.current = scanner;
          scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            (decodedText: string) => { processBarcode(decodedText); },
            () => {}
          ).catch(() => {
            setError("Camera access denied. Please use manual entry.");
            setMode("manual");
          });
        } catch (e) {
          setError("Camera not available. Please use manual entry.");
          setMode("manual");
        }
      }, 500);
    }
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch (e) {}
        scannerRef.current = null;
      }
    };
  }, [mode]);

  async function handleManualLookup() {
    if (!barcode.trim()) return;
    await processBarcode(barcode.trim());
  }

  if (loading || loadingAI) {
    return (
      <div style={styles.screen}>
        <div style={styles.loadingBox}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>
            {loading ? "Looking up product..." : "🤖 AI is analyzing ingredients..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <button style={styles.backButton} onClick={() => {
        if (scannerRef.current) {
          try { scannerRef.current.stop(); } catch (e) {}
          scannerRef.current = null;
        }
        onBack();
      }}>← Back</button>

      {mode === "choice" && (
        <>
          <div style={styles.logo}>📷</div>
          <h2 style={styles.title}>Scan Product</h2>
          <p style={styles.subtitle}>Choose how you want to look up a product</p>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.scanButton} onClick={() => { setError(""); setMode("camera"); }}>
            📷 Use Camera
          </button>
          <button style={styles.secondaryButton} onClick={() => { setError(""); setMode("manual"); }}>
            ⌨️ Enter Barcode Manually
          </button>
        </>
      )}

      {mode === "camera" && (
        <>
          <h2 style={styles.title}>Point at Barcode</h2>
          <p style={styles.subtitle}>Hold your camera steady over the barcode</p>
          <div id={scannerDivId} style={styles.cameraBox} />
          <button style={styles.secondaryButton} onClick={() => {
            if (scannerRef.current) {
              try { scannerRef.current.stop(); } catch (e) {}
              scannerRef.current = null;
            }
            setMode("manual");
          }}>
            ⌨️ Enter manually instead
          </button>
        </>
      )}

      {mode === "manual" && (
        <>
          <div style={styles.logo}>🔍</div>
          <h2 style={styles.title}>Enter Barcode</h2>
          <p style={styles.subtitle}>Type the barcode number from the packaging</p>
          {error && <p style={styles.error}>{error}</p>}
          <input
            style={styles.input}
            type="number"
            placeholder="e.g. 7622210449283"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
          />
          <button style={styles.scanButton} onClick={handleManualLookup}>
            Check This Product
          </button>
          <button style={styles.secondaryButton} onClick={() => setMode("camera")}>
            📷 Use camera instead
          </button>
        </>
      )}
    </div>
  );
}

function ResultScreen({ result, onBack }: any) {
  const ai = result.aiAnalysis;
  const isSafe = ai ? ai.isSafe : result.flagged && result.flagged.length === 0;
  const flaggedItems = ai ? ai.flaggedIngredients : result.flagged;
  const hasIngredients = result.ingredients && result.ingredients !== "Ingredients not listed";
  const ingredientList = hasIngredients
    ? result.ingredients.split(/,(?![^(]*\))/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div style={styles.screen}>
      <button style={styles.backButton} onClick={onBack}>← Scan Another</button>
      <div style={{ ...styles.resultCard, borderColor: isSafe ? "#16a34a" : "#dc2626" }}>
        <div style={styles.resultEmoji}>{isSafe ? "✅" : "❌"}</div>
        <h2 style={{ ...styles.resultTitle, color: isSafe ? "#14532d" : "#7f1d1d" }}>
          {isSafe ? "Jain Safe!" : "Not Jain Safe"}
        </h2>
        <p style={styles.productName}>{result.name || "Unknown Product"}</p>
        {result.brand ? <p style={styles.productBrand}>{result.brand}</p> : null}
      </div>

      {!isSafe && flaggedItems && flaggedItems.length > 0 && (
        <div style={styles.flaggedBox}>
          <p style={styles.flaggedTitle}>⚠️ Restricted ingredients found:</p>
          {flaggedItems.map((item: string) => (
            <div key={item} style={styles.flaggedItem}>🚫 {item}</div>
          ))}
        </div>
      )}

      {!hasIngredients && (
        <div style={styles.warningBox}>
          <p style={styles.warningText}>⚠️ No ingredient list found. Result may be incomplete.</p>
        </div>
      )}

      {hasIngredients && (
        <div style={styles.ingredientBox}>
          <p style={styles.ingredientTitle}>Full ingredient list:</p>
          <ul style={styles.ingredientList}>
            {ingredientList.map((ing: string, i: number) => (
              <li key={i} style={styles.ingredientItem}>{ing}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily: "system-ui, sans-serif",
    padding: "20px 0"
  },
  screen: {
    width: "100%",
    maxWidth: "400px",
    padding: "40px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px"
  },
  hero: { textAlign: "center", marginBottom: "8px" },
  logo: { fontSize: "56px", marginBottom: "8px" },
  title: { fontSize: "36px", fontWeight: "800", color: "#14532d", margin: "0 0 8px 0" },
  subtitle: {
    fontSize: "15px", color: "#166534", lineHeight: "1.6",
    maxWidth: "280px", margin: "0 auto", textAlign: "center"
  },
  scanButton: {
    background: "#16a34a", color: "white", border: "none",
    borderRadius: "16px", padding: "16px 48px", fontSize: "17px",
    fontWeight: "700", cursor: "pointer",
    boxShadow: "0 8px 24px rgba(22,163,74,0.35)", width: "100%", maxWidth: "300px"
  },
  secondaryButton: {
    background: "white", color: "#16a34a", border: "2px solid #16a34a",
    borderRadius: "16px", padding: "14px 48px", fontSize: "16px",
    fontWeight: "600", cursor: "pointer", width: "100%", maxWidth: "300px"
  },
  hint: { color: "#86efac", fontSize: "13px" },
  backButton: {
    alignSelf: "flex-start", background: "none", border: "none",
    fontSize: "15px", color: "#166534", cursor: "pointer", fontWeight: "600"
  },
  input: {
    width: "100%", maxWidth: "300px", padding: "14px 16px",
    borderRadius: "12px", border: "2px solid #86efac",
    fontSize: "16px", outline: "none", background: "white", boxSizing: "border-box"
  },
  error: { color: "#dc2626", fontSize: "14px" },
  demoSection: { textAlign: "center", marginTop: "16px" },
  demoLabel: { color: "#166534", fontSize: "13px", marginBottom: "8px" },
  demoRow: { display: "flex", gap: "8px" },
  demoBtn: {
    background: "white", border: "2px solid #86efac", borderRadius: "10px",
    padding: "10px 16px", fontSize: "13px", cursor: "pointer",
    color: "#166534", fontWeight: "600"
  },
  cameraBox: {
    width: "100%", maxWidth: "320px", borderRadius: "16px",
    overflow: "hidden", border: "3px solid #16a34a"
  },
  loadingBox: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "16px", marginTop: "100px"
  },
  spinner: { fontSize: "48px" },
  loadingText: { fontSize: "16px", color: "#166534", fontWeight: "600" },
  resultCard: {
    width: "100%", maxWidth: "320px", background: "white",
    borderRadius: "20px", border: "3px solid", padding: "28px",
    textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
  },
  resultEmoji: { fontSize: "56px", marginBottom: "8px" },
  resultTitle: { fontSize: "28px", fontWeight: "800", margin: "0 0 8px 0" },
  productName: { fontSize: "16px", color: "#374151", fontWeight: "600", margin: "4px 0" },
  productBrand: { fontSize: "13px", color: "#9ca3af", margin: "0" },
  flaggedBox: {
    width: "100%", maxWidth: "320px", background: "#fef2f2",
    borderRadius: "12px", padding: "16px", border: "1px solid #fecaca"
  },
  flaggedTitle: { color: "#7f1d1d", fontWeight: "700", fontSize: "14px", margin: "0 0 8px 0" },
  flaggedItem: { color: "#dc2626", fontSize: "14px", padding: "4px 0", fontWeight: "500" },
  warningBox: {
    width: "100%", maxWidth: "320px", background: "#fffbeb",
    borderRadius: "12px", padding: "16px", border: "1px solid #fde68a"
  },
  warningText: { color: "#92400e", fontSize: "13px", margin: "0", textAlign: "center" },
  ingredientBox: {
    width: "100%", maxWidth: "320px", background: "rgba(255,255,255,0.7)",
    borderRadius: "12px", padding: "16px"
  },
  ingredientTitle: { color: "#374151", fontWeight: "700", fontSize: "13px", margin: "0 0 6px 0" },
  ingredientList: { margin: "0", paddingLeft: "20px", width: "100%" },
  ingredientItem: { color: "#6b7280", fontSize: "12px", lineHeight: "1.8", textAlign: "left" }
};