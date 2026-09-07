import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFoodLogs } from '../hooks/useFoodLogs';
import { useRecentFoods } from '../hooks/useRecentFoods';
import { useCustomFoods } from '../hooks/useCustomFoods';
import { useSavedMeals } from '../hooks/useSavedMeals';
import { useFavouriteFoods } from '../hooks/useFavouriteFoods';
import { useFrequentFoods } from '../hooks/useFrequentFoods';
import { useLastLoggedAmounts } from '../hooks/useLastLoggedAmounts';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { todayLocalDate } from '../lib/patterns';
import { getBarcodeProduct, addBarcodeProduct, searchAfcdFoods } from '../lib/db';
import { expandFoodSlang } from '../lib/foodSlang';
import { supabase } from '../lib/supabase';
import CameraCapture from '../components/CameraCapture';
import { mealFromDate, currentTimeHHMM, timeStringToDate, formatTime12h, formatTimeFromDate } from '../lib/mealTime';
import { scaleFood, UNITS, amountToServings } from '../lib/foodMath';
import AppNav from '../components/AppNav';
import PhotoScanModal from '../components/PhotoScanModal';
import MenuScanModal from '../components/MenuScanModal';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { getCategoryStyle } from '../lib/foodCategories';

// ─── Data ────────────────────────────────────────────────────────────────────

const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];




// ─── Live search ─────────────────────────────────────────────────────────
// Open Food Facts — no API key required, strong branded/packaged coverage
// (this is what finds things like Weet-Bix, Vegemite, etc.). Uses the
// Australia subdomain so results are products actually sold here
// (Capilano, Sanitarium, Woolworths own brand, etc.) instead of being
// dominated by UK/US supermarket SKUs.
// Open Food Facts reports everything per-100g in grams (even things like
// cholesterol/calcium/iron that are more naturally read in mg, and vitamin D
// which is more naturally read in micrograms) — convert each to the unit
// food_logs actually stores, scaled by the same `factor` used for cal/protein/etc.
function extraMicrosFromOFF(per100, factor) {
  return {
    saturatedFat: Math.round((per100["saturated-fat_100g"] || 0) * factor * 10) / 10,
    transFat: Math.round((per100["trans-fat_100g"] || 0) * factor * 10) / 10,
    cholesterol: Math.round((per100["cholesterol_100g"] || 0) * factor * 1000),
    potassium: Math.round((per100["potassium_100g"] || 0) * factor * 1000),
    addedSugar: Math.round((per100["added-sugars_100g"] || 0) * factor * 10) / 10,
    vitaminD: Math.round((per100["vitamin-d_100g"] || 0) * factor * 1000000 * 10) / 10,
    calcium: Math.round((per100["calcium_100g"] || 0) * factor * 1000),
    iron: Math.round((per100["iron_100g"] || 0) * factor * 1000 * 10) / 10,
  };
}

async function searchOpenFoodFacts(q) {
  const url = `https://au.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n&fields=product_name,generic_name,brands,nutriments,code`;
  // Open Food Facts' shared search backend has occasional one-off blips
  // (a request fails, the very next one succeeds) — one retry absorbs
  // that without surfacing a false "unavailable" error to the user.
  let res;
  try {
    res = await fetch(url);
  } catch {
    await new Promise(r => setTimeout(r, 500));
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`Open Food Facts search failed: ${res.status}`);
  const data = await res.json();
  return (data.products || []).map(p => {
    const n = p.nutriments || {};
    const cal = Math.round(n["energy-kcal_100g"] || (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0) || 0);
    const name = p.product_name || p.generic_name;
    if (!cal || !name) return null;
    return {
      id: "off_" + p.code,
      name: p.brands ? `${name} (${p.brands})` : name,
      meta: "100g",
      cuisine: "all",
      cal,
      protein: Math.round((n.proteins_100g || 0) * 10) / 10,
      carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
      fat: Math.round((n.fat_100g || 0) * 10) / 10,
      fibre: Math.round((n.fiber_100g || 0) * 10) / 10,
      sodium: Math.round((n.sodium_100g || 0) * 1000),
      sugar: Math.round((n.sugars_100g || 0) * 10) / 10,
      ...extraMicrosFromOFF(n, 1),
      source: "off",
      servingGrams: 100,
    };
  }).filter(Boolean);
}

// FatSecret Platform API — a purpose-built consumer food search database
// (the same one MacroFactor licenses), routed through our own serverless
// proxy at /api/fatsecret-search since FatSecret's OAuth Client Secret
// can't safely be exposed in browser code. Unlike USDA's research-database
// search — built for scientists, not food-logging apps, and needing a pile
// of client-side re-ranking heuristics to be usable — FatSecret's own
// relevance ranking is tuned on real consumer search behaviour, so no
// re-ranking is needed here.
function fatSecretServings(food) {
  const raw = food.servings?.serving;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

// Most servings describe themselves in grams ("100 g", "150g slice") — pull
// that out for unit conversion. Servings described in non-gram units
// ("1 cup", "1 medium") fall back to 100; the default "serving" unit in the
// add-to-log UI is unaffected either way since it uses the API's own
// serving values directly rather than converting through grams.
function parseGramsFromServing(serving) {
  const match = (serving.serving_description || "").match(/([\d.]+)\s*g\b/i);
  return match ? parseFloat(match[1]) : 100;
}

// FatSecret reports these already in the units food_logs stores them in
// (mg for cholesterol/potassium/calcium, mcg for vitamin D) — no unit
// conversion needed here, unlike Open Food Facts' all-grams convention.
function extraMicrosFromFatSecretServing(serving) {
  return {
    saturatedFat: Math.round((parseFloat(serving.saturated_fat) || 0) * 10) / 10,
    transFat: Math.round((parseFloat(serving.trans_fat) || 0) * 10) / 10,
    cholesterol: Math.round(parseFloat(serving.cholesterol) || 0),
    potassium: Math.round(parseFloat(serving.potassium) || 0),
    addedSugar: Math.round((parseFloat(serving.added_sugars) || 0) * 10) / 10,
    vitaminD: Math.round((parseFloat(serving.vitamin_d) || 0) * 10) / 10,
    calcium: Math.round(parseFloat(serving.calcium) || 0),
    iron: Math.round((parseFloat(serving.iron) || 0) * 10) / 10,
  };
}

async function searchFatSecret(q) {
  const url = `/api/fatsecret-search?q=${encodeURIComponent(q)}`;
  let res = await fetch(url);
  if (!res.ok) res = await fetch(url);
  if (!res.ok) throw new Error(`FatSecret search failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "FatSecret search failed");

  const rawFoods = data.foods_search?.results?.food;
  const foods = Array.isArray(rawFoods) ? rawFoods : rawFoods ? [rawFoods] : [];

  return foods.map(food => {
    const serving = fatSecretServings(food)[0];
    if (!serving) return null;
    const cal = Math.round(parseFloat(serving.calories) || 0);
    if (!cal) return null;
    return {
      id: "fs_" + food.food_id,
      name: food.food_type === "Brand" && food.brand_name ? `${food.food_name} (${food.brand_name})` : food.food_name,
      meta: serving.serving_description || "1 serving",
      cuisine: "all",
      cal,
      protein: Math.round((parseFloat(serving.protein) || 0) * 10) / 10,
      carbs: Math.round((parseFloat(serving.carbohydrate) || 0) * 10) / 10,
      fat: Math.round((parseFloat(serving.fat) || 0) * 10) / 10,
      fibre: Math.round((parseFloat(serving.fiber) || 0) * 10) / 10,
      sodium: Math.round(parseFloat(serving.sodium) || 0),
      sugar: Math.round((parseFloat(serving.sugar) || 0) * 10) / 10,
      ...extraMicrosFromFatSecretServing(serving),
      source: "fatsecret",
      servingGrams: parseGramsFromServing(serving),
    };
  }).filter(Boolean);
}

// Australian Food Composition Database (FSANZ) — a read-only Supabase
// table populated once from a government dataset (see
// supabase/afcd_import.sql), covering real Australian foods FatSecret and
// Open Food Facts often get wrong or don't have at all. All values are
// per 100g, same convention as Open Food Facts.
async function searchAfcd(q) {
  const rows = await searchAfcdFoods(q);
  return rows.map(row => ({
    id: "afcd_" + row.id,
    name: row.name,
    meta: "100g · AFCD",
    cuisine: "all",
    cal: Math.round(row.calories),
    protein: Math.round(row.protein_g * 10) / 10,
    carbs: Math.round(row.carbs_g * 10) / 10,
    fat: Math.round(row.fat_g * 10) / 10,
    fibre: Math.round(row.fibre_g * 10) / 10,
    sodium: Math.round(row.sodium_mg),
    sugar: Math.round(row.sugar_g * 10) / 10,
    source: "afcd",
    servingGrams: 100,
  }));
}

// ─── Barcode Scanner ──────────────────────────────────────────────────────────

// GTIN-13 is what FatSecret's barcode endpoint expects — UPC-A (12 digits)
// and EAN-8 zero-pad up to it cleanly, which covers the formats ZXing is
// configured to detect below.
function toGtin13(code) {
  const digits = code.replace(/\D/g, "");
  return digits.padStart(13, "0").slice(-13);
}

// A product with next-to-no calories AND next-to-no macros is almost never
// a genuinely 0-calorie food — it's an incomplete/placeholder database
// entry (confirmed by direct testing: real barcodes from both FatSecret and
// Open Food Facts can return e.g. "1 kcal, 0.1g protein, 0.1g carbs, 0g
// fat" for products that plainly aren't that). Reject it so the other
// source gets a chance instead of showing meaningless zeros as fact.
function looksLikeEmptyNutrition(f) {
  return f.cal < 5 && f.protein < 0.5 && f.carbs < 0.5 && f.fat < 0.5;
}

// FatSecret's barcode data is far more complete than Open Food Facts' (many
// OFF entries have missing/zeroed nutriment fields — confirmed by direct
// testing), so it's tried first. OFF stays as a fallback for products
// FatSecret doesn't have (its "No food item detected" response), since
// OFF's crowdsourced coverage skews better for AU-specific/regional items.
async function lookupFatSecretBarcode(barcode) {
  const res = await fetch(`/api/fatsecret-barcode?barcode=${encodeURIComponent(toGtin13(barcode))}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error || !data.food) return null;
  const food = data.food;
  const rawServings = food.servings?.serving;
  const servings = Array.isArray(rawServings) ? rawServings : rawServings ? [rawServings] : [];
  const serving = servings[0];
  if (!serving) return null;
  const found = {
    name: food.food_name,
    brand: food.brand_name || "",
    serving: serving.serving_description || "1 serving",
    cal: Math.round(parseFloat(serving.calories) || 0),
    protein: Math.round((parseFloat(serving.protein) || 0) * 10) / 10,
    carbs: Math.round((parseFloat(serving.carbohydrate) || 0) * 10) / 10,
    fat: Math.round((parseFloat(serving.fat) || 0) * 10) / 10,
    fibre: Math.round((parseFloat(serving.fiber) || 0) * 10) / 10,
    sodium: Math.round(parseFloat(serving.sodium) || 0),
    sugar: Math.round((parseFloat(serving.sugar) || 0) * 10) / 10,
    ...extraMicrosFromFatSecretServing(serving),
    source: "fatsecret",
    servingGrams: parseGramsFromServing(serving),
  };
  return looksLikeEmptyNutrition(found) ? null : found;
}

// Open Food Facts' serving_size is a free-text human label, not a bare
// number — e.g. "1 bottle (425 g)", "2 slices (60g)". A plain parseFloat()
// on that string reads the leading "1" (from "1 bottle"), not the actual
// weight, undershooting every scaled value by ~100x. Confirmed with a real
// scan: "1 bottle (425 g)" parsed to 1g instead of 425g, turning a
// legitimate 289 kcal/30g-protein serving into "1 kcal, 0.1g protein".
function extractServingGrams(servingSizeStr) {
  if (!servingSizeStr) return null;
  // Only trust a number that's actually attached to a weight/volume unit
  // (g/ml) — a bare number with no unit (e.g. "1 serving", "2 pieces") is a
  // count, not a weight, and grabbing it the same way caused this exact
  // bug: "1 bottle (425 g)" has to match on the "425 g", not the leading "1".
  const withUnit = servingSizeStr.match(/([\d.]+)\s*(?:g|ml)\b/i);
  return withUnit ? parseFloat(withUnit[1]) : null;
}

async function lookupOpenFoodFactsBarcode(barcode) {
  const res = await fetch(`https://au.openfoodfacts.org/api/v0/product/${barcode}.json`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product; const per100 = p.nutriments || {};
  const servingG = extractServingGrams(p.serving_size) || 100; const factor = servingG / 100;
  const cal = Math.round((per100["energy-kcal_100g"] || per100["energy_100g"] / 4.184 || 0) * factor);
  const found = {
    name: p.product_name || p.generic_name || "Unknown product",
    brand: p.brands || "", serving: p.serving_size || "100g",
    cal,
    protein: Math.round((per100.proteins_100g || 0) * factor * 10) / 10,
    carbs: Math.round((per100.carbohydrates_100g || 0) * factor * 10) / 10,
    fat: Math.round((per100.fat_100g || 0) * factor * 10) / 10,
    fibre: Math.round((per100.fiber_100g || 0) * factor * 10) / 10,
    sodium: Math.round((per100.sodium_100g || 0) * factor * 1000),
    sugar: Math.round((per100.sugars_100g || 0) * factor * 10) / 10,
    ...extraMicrosFromOFF(per100, factor),
    source: "off",
    servingGrams: servingG,
  };
  return looksLikeEmptyNutrition(found) ? null : found;
}

// Last resort after FatSecret and Open Food Facts both come up empty —
// nutrition data other Attune users have contributed for this exact
// barcode (see barcode_products in supabase/schema.sql). Converts the DB
// row's column names to the same `found` shape the two lookups above
// produce, so everything downstream (scaling, AddControls) is unaware
// of which source it came from.
async function lookupSharedBarcodeProduct(barcode) {
  const row = await getBarcodeProduct(barcode);
  if (!row) return null;
  return {
    name: row.name,
    brand: row.brand || '',
    serving: row.serving || '1 serving',
    cal: Math.round(row.calories || 0),
    protein: Math.round((row.protein_g || 0) * 10) / 10,
    carbs: Math.round((row.carbs_g || 0) * 10) / 10,
    fat: Math.round((row.fat_g || 0) * 10) / 10,
    fibre: Math.round((row.fibre_g || 0) * 10) / 10,
    sodium: Math.round(row.sodium_mg || 0),
    sugar: Math.round((row.sugar_g || 0) * 10) / 10,
    source: 'community',
    servingGrams: row.serving_grams || null,
  };
}

const BLANK_NEW_PRODUCT = { name: '', brand: '', serving: '', servingGrams: '', cal: '', protein: '', carbs: '', fat: '', fibre: '', sodium: '', sugar: '' };

// ─── Barcode scan — menu/plate photo scanning live elsewhere as
//    MenuScanModal/PhotoScanModal, proxied through server-side /api routes
//    so the vision API key never reaches the browser. Owns its own modal
//    chrome (no separate ScanModal wrapper) since it needs to switch
//    between a full-screen camera step and a normal modal card depending
//    on internal state. ─────────────────────────────────────────────────
function BarcodeScanner({ onAddFood, onClose, defaultMeal, defaultTime, selectedDate, isPremium, onCreateCustom, onSearchManually }) {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  // Guards against the decode callback firing more than once for the same
  // detection (ZXing can report the same barcode on consecutive frames
  // before the stream actually stops) — without this, two concurrent
  // lookups can land in either order and leave a stale error sitting next
  // to a valid result, since they write to separate state.
  const processingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(defaultTime);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("serving");
  const { closing, close } = useClosingTransition(onClose);

  // "Add this product" — offered when neither FatSecret, Open Food
  // Facts, nor the shared barcode_products table has this barcode.
  // Nutrition facts come from a photo of the label (recognize-label);
  // name/brand are typed, not guessed from the label, since a nutrition
  // panel rarely carries a clean marketing name.
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState(BLANK_NEW_PRODUCT);
  const [labelAnalyzing, setLabelAnalyzing] = useState(false);
  const [labelError, setLabelError] = useState(null);
  const [labelPreview, setLabelPreview] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);

  async function startScanner() {
    setError(null); setResult(null); setLooking(true);
    processingRef.current = false;
    try {
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      // Retail barcodes only — narrowing formats (instead of ZXing's full
      // default set, which also tries QR/PDF417/Aztec/etc every frame)
      // means less wasted work per frame and fewer false reads.
      // TRY_HARDER spends more time per frame to tolerate the tilted/
      // slightly-off-angle holds real handheld scanning actually looks like.
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      // decodeFromConstraints + facingMode (rather than enumerating devices
      // and guessing which one is "back" from its label) both skips an
      // extra device-listing round trip before the camera opens, and lets
      // us request continuous autofocus, which is most of why a barcode
      // previously needed to be held dead-still to focus.
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: "continuous" }],
          },
        },
        videoRef.current,
        async (res) => {
          if (res && !processingRef.current) {
            processingRef.current = true;
            stopScanner();
            setScanning(true);
            await lookupBarcode(res.getText());
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      console.error(err);
      setError("Couldn't access camera. Make sure you've allowed camera permission.");
      setLooking(false);
    }
  }

  function stopScanner() {
    if (controlsRef.current) { try { controlsRef.current.stop(); } catch { /* already stopped */ } controlsRef.current = null; }
    setLooking(false);
  }

  // Jump straight into the camera on open — no reason to make someone tap
  // "Start scanning" first when they already tapped "Scan barcode" to get
  // here. Deliberately mount-only: startScanner/stopScanner recreate every
  // render, but re-running this on every render would restart the camera.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { startScanner(); return () => stopScanner(); }, []);

  async function lookupBarcode(barcode) {
    setScannedBarcode(barcode);
    try {
      const found = (await lookupFatSecretBarcode(barcode).catch(() => null))
        || (await lookupOpenFoodFactsBarcode(barcode).catch(() => null))
        || (await lookupSharedBarcodeProduct(barcode).catch(() => null));
      if (!found) {
        setResult(null);
        setError(`Product not found for barcode ${barcode}. Try searching manually, or add it yourself.`);
        return;
      }
      setError(null);
      setResult(found);
      setAmount(1);
      setUnit("serving");
      setTime(currentTimeHHMM());
    } catch (err) { console.error(err); setResult(null); setError("Couldn't look up this product. Check your connection and try again."); }
    finally { setScanning(false); }
  }

  function reset() {
    setResult(null); setError(null); setScanning(false); setAddingProduct(false);
    setNewProduct(BLANK_NEW_PRODUCT); setLabelError(null); setLabelPreview(null);
    startScanner();
  }

  function updateNewProduct(key, val) { setNewProduct(p => ({ ...p, [key]: val })); }

  async function handleLabelPhoto(file) {
    setLabelAnalyzing(true);
    setLabelError(null);
    try {
      const { dataUrl, base64 } = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          const d = canvas.toDataURL("image/jpeg", 0.85);
          resolve({ dataUrl: d, base64: d.split(",")[1] });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
        img.src = url;
      });
      setLabelPreview(dataUrl);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/recognize-label", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image: base64, mediaType: "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setLabelError(data.error || "Couldn't read this label. Try again or enter the numbers yourself.");
        return;
      }
      setNewProduct(p => ({
        ...p,
        serving: data.serving || p.serving,
        servingGrams: data.servingGrams != null ? String(data.servingGrams) : p.servingGrams,
        cal: String(data.cal ?? 0),
        protein: String(data.protein ?? 0),
        carbs: String(data.carbs ?? 0),
        fat: String(data.fat ?? 0),
        fibre: String(data.fibre ?? 0),
        sodium: String(data.sodium ?? 0),
        sugar: String(data.sugar ?? 0),
      }));
    } catch (err) {
      console.error(err);
      setLabelError("Couldn't read this label. Check your connection and try again.");
    } finally {
      setLabelAnalyzing(false);
    }
  }

  async function saveNewProduct() {
    if (!newProduct.name.trim() || !scannedBarcode || savingProduct) return;
    setSavingProduct(true);
    try {
      const fields = {
        name: newProduct.name.trim(),
        brand: newProduct.brand.trim() || null,
        serving: newProduct.serving.trim() || "1 serving",
        serving_grams: newProduct.servingGrams ? Number(newProduct.servingGrams) : null,
        calories: Number(newProduct.cal) || 0,
        protein_g: Number(newProduct.protein) || 0,
        carbs_g: Number(newProduct.carbs) || 0,
        fat_g: Number(newProduct.fat) || 0,
        fibre_g: Number(newProduct.fibre) || 0,
        sodium_mg: Number(newProduct.sodium) || 0,
        sugar_g: Number(newProduct.sugar) || 0,
      };
      // Someone else may have submitted this exact barcode between when
      // the lookup failed and now — an insert conflict there just means
      // the shared table already has it, so fall back to using that
      // instead of surfacing a confusing "already exists" error.
      const saved = await addBarcodeProduct(user.id, scannedBarcode, fields).catch(() => lookupSharedBarcodeProduct(scannedBarcode));
      const found = saved.barcode ? {
        name: saved.name, brand: saved.brand || "", serving: saved.serving || "1 serving",
        cal: Math.round(saved.calories || 0), protein: Math.round((saved.protein_g || 0) * 10) / 10,
        carbs: Math.round((saved.carbs_g || 0) * 10) / 10, fat: Math.round((saved.fat_g || 0) * 10) / 10,
        fibre: Math.round((saved.fibre_g || 0) * 10) / 10, sodium: Math.round(saved.sodium_mg || 0),
        sugar: Math.round((saved.sugar_g || 0) * 10) / 10, source: "community", servingGrams: saved.serving_grams || null,
      } : saved;
      setAddingProduct(false);
      setError(null);
      setResult(found);
      setAmount(1);
      setUnit("serving");
      setTime(currentTimeHHMM());
    } catch (err) {
      console.error(err);
      setLabelError("Couldn't save this product. Check your connection and try again.");
    } finally {
      setSavingProduct(false);
    }
  }

  const servingGrams = result?.servingGrams || 100;
  const servings = result ? amountToServings(Number(amount) || 0, unit, servingGrams) : 0;
  const gramsEquivalent = Math.round(servings * servingGrams);
  const scaled = result ? { ...scaleFood(result, servings || 0), servingGrams: gramsEquivalent } : null;

  // The scanning camera is its own full-screen step — same treatment as
  // PhotoScanModal/MenuScanModal — not squeezed into the modal card.
  // Covers the whole pre-result lifecycle: opening, actively looking, and
  // the brief lookup spinner right after a barcode is detected. An error
  // (camera access denied, or "product not found") deliberately falls
  // through to the modal-card branch below instead, since that's where
  // the fallback actions (search manually, create custom food, add this
  // product) already live.
  const cameraStep = !result && !error && !addingProduct;

  if (cameraStep) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: looking ? "block" : "none" }} />

        {!looking && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#555" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #333", borderTopColor: "#8fbc8f", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 12 }}>Opening camera…</div>
          </div>
        )}

        <button
          onClick={close}
          aria-label="Close camera"
          title="Close"
          style={{ position: "absolute", top: "calc(16px + env(safe-area-inset-top))", left: 16, width: 38, height: 38, borderRadius: "50%", background: "rgba(20,20,20,0.6)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          ✕
        </button>

        {looking && (
          <>
            <div style={{ position: "absolute", top: "calc(24px + env(safe-area-inset-top))", left: 0, right: 0, textAlign: "center", fontSize: 13, color: "#ccc", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
              Point your camera at a barcode
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "70%", height: 2, background: "#8fbc8f", opacity: 0.7, boxShadow: "0 0 8px #8fbc8f", borderRadius: 2 }} />
            </div>
          </>
        )}

        {scanning && (
          <div style={{ position: "absolute", bottom: "calc(40px + env(safe-area-inset-bottom))", left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#ccc", fontSize: 13 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #444", borderTopColor: "#8fbc8f", animation: "spin 0.8s linear infinite" }} />
            Looking up product…
          </div>
        )}
      </div>
    );
  }

  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
    <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-default)", position: "sticky", top: 0, background: "var(--bg-subtle)", zIndex: 10 }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{addingProduct ? "Add product" : result ? "Product found" : "Scan barcode"}</span>
        <button onClick={close} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
      </div>
      <div style={{ padding: 20 }}>
      {error && !addingProduct && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ background: "#1a0f0f", border: "1px solid #c0707040", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 10 }}>{error}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={onSearchManually} style={{ flex: 1, background: "transparent", border: "1px solid var(--border-default)", borderRadius: 8, padding: "9px", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <i className="ti ti-search" style={{ fontSize: 14 }} /> Search manually
            </button>
            <button onClick={onCreateCustom} style={{ flex: 1, background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 8, padding: "9px", fontSize: 13, color: "var(--accent)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <i className="ti ti-plus" style={{ fontSize: 14 }} /> Create custom food
            </button>
          </div>
          {scannedBarcode && (
            <button onClick={() => setAddingProduct(true)} style={{ width: "100%", background: "transparent", border: "1px dashed var(--border-default)", borderRadius: 8, padding: "9px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <i className="ti ti-barcode" style={{ fontSize: 14 }} /> Add this product for everyone
            </button>
          )}
        </div>
      )}

      {addingProduct && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Add product — barcode {scannedBarcode}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <input type="text" placeholder="Product name" value={newProduct.name} onChange={e => updateNewProduct("name", e.target.value)}
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <input type="text" placeholder="Brand (optional)" value={newProduct.brand} onChange={e => updateNewProduct("brand", e.target.value)}
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          </div>

          {!labelPreview && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Take a photo of the nutrition facts label — it'll fill in the numbers below.</div>
              <CameraCapture onCapture={handleLabelPhoto} hint="Fit the whole nutrition panel in frame" />
            </>
          )}

          {labelAnalyzing && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "16px 0", color: "var(--text-muted)", fontSize: 13 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border-default)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
              Reading label…
            </div>
          )}
          {labelError && <div style={{ background: "#1a0f0f", border: "1px solid #c0707040", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>{labelError}</div>}

          {labelPreview && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
              <img src={labelPreview} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>Label read — review the numbers below and adjust anything that's off before saving.</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input type="text" placeholder="Serving (e.g. 1 cup)" value={newProduct.serving} onChange={e => updateNewProduct("serving", e.target.value)}
              style={{ gridColumn: "1 / -1", background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            {[
              ["cal", "Calories"], ["protein", "Protein (g)"], ["carbs", "Carbs (g)"], ["fat", "Fat (g)"],
              ["fibre", "Fibre (g)"], ["sodium", "Sodium (mg)"], ["sugar", "Sugar (g)"], ["servingGrams", "Serving (g)"],
            ].map(([key, label]) => (
              <input key={key} type="number" inputMode="decimal" placeholder={label} value={newProduct[key]} onChange={e => updateNewProduct(key, e.target.value)}
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setAddingProduct(false); setLabelError(null); setLabelPreview(null); setNewProduct(BLANK_NEW_PRODUCT); }}
              style={{ flex: 1, background: "transparent", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Cancel
            </button>
            <button onClick={saveNewProduct} disabled={!newProduct.name.trim() || savingProduct}
              style={{
                flex: 2, background: !newProduct.name.trim() || savingProduct ? "var(--border-default)" : "var(--accent)",
                border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600,
                color: !newProduct.name.trim() || savingProduct ? "var(--text-muted)" : "#0f0f0f",
                cursor: !newProduct.name.trim() || savingProduct ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>
              {savingProduct ? "Saving…" : "Save & continue"}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Product found</div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-active)", borderRadius: 10, padding: "14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600, marginBottom: 2 }}>{result.name}</div>
            {result.brand && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{result.brand} · {result.serving}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{scaled.protein}g</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Protein</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 600, color: "var(--water-blue)" }}>{scaled.carbs}g</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Carbs</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 600, color: "var(--warning)" }}>{scaled.fat}g</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Fat</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 600, color: "var(--ai-purple)" }}>{scaled.fibre}g</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Fibre</div></div>
            </div>
            <div style={{ display: "flex", gap: 16, paddingTop: 10, borderTop: "1px solid var(--border-default)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sodium <span style={{ color: "var(--text-secondary)" }}>{scaled.sodium}mg</span></div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sugar <span style={{ color: "var(--text-secondary)" }}>{scaled.sugar}g</span></div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{scaled.cal}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}> kcal{unit !== "g" && ` · ≈${gramsEquivalent}g`} — label serving: {result.serving}</span>
          </div>
          <AddControls
            amount={amount} setAmount={setAmount}
            unit={unit} setUnit={setUnit}
            meal={meal} setMeal={setMeal}
            time={time} setTime={setTime}
            isPremium={isPremium}
            onAdd={() => { onAddFood(scaled, isPremium ? null : meal, isPremium ? timeStringToDate(time, new Date(selectedDate + "T00:00:00")) : null); onClose(); }}
            disabled={!servings}
          />
          <button onClick={reset} style={{ marginTop: 10, width: "100%", background: "transparent", border: "1px solid var(--border-default)", borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Scan again</button>
        </div>
      )}
      </div>
    </div>
    </div>
  );
}

// ─── Modal shell (shared by the create-food / saved-meals / builder modals) ──

function ModalShell({ title, onClose, children, maxWidth = 460 }) {
  const { closing, close } = useClosingTransition(onClose);
  return (
    <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 16, width: "100%", maxWidth, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-default)", position: "sticky", top: 0, background: "var(--bg-subtle)", zIndex: 10 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{title}</span>
          <button onClick={close} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

const fieldStyle = { width: "100%", background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "9px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, color: "var(--text-muted)", marginBottom: 5, display: "block" };

// ─── Create a custom food ───────────────────────────────────────────────────

function CreateFoodModal({ onClose, onCreate, initialName }) {
  const [name, setName] = useState(initialName || "");
  const [brand, setBrand] = useState("");
  const [servingLabel, setServingLabel] = useState("1 serving");
  const [servingGrams, setServingGrams] = useState("");
  const [cal, setCal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fibre, setFibre] = useState("");
  const [sodium, setSodium] = useState("");
  const [sugar, setSugar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const valid = name.trim() && Number(cal) >= 0 && cal !== "";

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        brand: brand.trim() || null,
        servingLabel: servingLabel.trim() || "1 serving",
        servingGrams: servingGrams ? Number(servingGrams) : null,
        cal: Number(cal) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        fibre: Number(fibre) || 0,
        sodium: Number(sodium) || 0,
        sugar: Number(sugar) || 0,
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save this food. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Create a custom food" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={labelStyle}>Food name *</label>
          <input style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mum's lasagna" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Brand (optional)</label>
            <input style={fieldStyle} value={brand} onChange={e => setBrand(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Serving size</label>
            <input style={fieldStyle} value={servingLabel} onChange={e => setServingLabel(e.target.value)} placeholder="1 serving" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Serving weight in grams (optional, for unit conversion)</label>
          <input style={fieldStyle} type="number" min="0" value={servingGrams} onChange={e => setServingGrams(e.target.value)} placeholder="e.g. 250" />
        </div>
        <div>
          <label style={labelStyle}>Calories *</label>
          <input style={fieldStyle} type="number" min="0" value={cal} onChange={e => setCal(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <div><label style={labelStyle}>Protein (g)</label><input style={fieldStyle} type="number" min="0" value={protein} onChange={e => setProtein(e.target.value)} /></div>
          <div><label style={labelStyle}>Carbs (g)</label><input style={fieldStyle} type="number" min="0" value={carbs} onChange={e => setCarbs(e.target.value)} /></div>
          <div><label style={labelStyle}>Fat (g)</label><input style={fieldStyle} type="number" min="0" value={fat} onChange={e => setFat(e.target.value)} /></div>
          <div><label style={labelStyle}>Fibre (g)</label><input style={fieldStyle} type="number" min="0" value={fibre} onChange={e => setFibre(e.target.value)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Sodium (mg)</label><input style={fieldStyle} type="number" min="0" value={sodium} onChange={e => setSodium(e.target.value)} /></div>
          <div><label style={labelStyle}>Sugar (g)</label><input style={fieldStyle} type="number" min="0" value={sugar} onChange={e => setSugar(e.target.value)} /></div>
        </div>
        {error && <div style={{ background: "#1a0f0f", border: "1px solid #c0707040", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--danger)" }}>{error}</div>}
        <button onClick={submit} disabled={!valid || saving} style={{ background: !valid || saving ? "var(--border-default)" : "var(--accent)", border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 600, color: !valid || saving ? "var(--text-muted)" : "#0f0f0f", cursor: !valid || saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          {saving ? "Saving…" : "Save custom food"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Saved meals (MyFitnessPal-style "Meals"/recipes) ──────────────────────

function SavedMealsModal({ meals, loading, onClose, onLog, onDelete, onStartBuilder }) {
  return (
    <ModalShell title="Saved meals" onClose={onClose}>
      <button onClick={onStartBuilder} style={{ width: "100%", background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <i className="ti ti-plus" /> Build a new meal
      </button>
      {loading ? null : meals.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-hint)", fontSize: 13, background: "var(--bg-card)", border: "1px dashed var(--border-default)", borderRadius: 10 }}>
          No saved meals yet. Build one from foods you log often.
        </div>
      ) : (
        meals.map(meal => {
          const items = meal.items || [];
          const totalCal = items.reduce((s, it) => s + (Number(it.cal) || 0), 0);
          return (
            <div key={meal.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{meal.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{items.length} item{items.length !== 1 ? "s" : ""} · {Math.round(totalCal)} kcal</div>
              </div>
              <button onClick={() => onLog(meal)} style={{ background: "var(--accent)", border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#0f0f0f", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Log all</button>
              <button onClick={() => onDelete(meal.id)} style={{ background: "none", border: "1px solid var(--border-default)", borderRadius: 7, padding: "7px 9px", color: "var(--danger)", cursor: "pointer" }}><i className="ti ti-trash" /></button>
            </div>
          );
        })
      )}
    </ModalShell>
  );
}

// ─── Meal builder review — save what's been added to the builder cart as a
//    named saved meal, and optionally log it right away ──────────────────

const FREE_SAVED_MEALS_LIMIT = 10;

function BuilderReviewModal({ items, onClose, onRemove, onSave, defaultMeal, defaultTime, selectedDate, isPremium, savedMealsCount, onUpgrade }) {
  const [name, setName] = useState("");
  const [logNow, setLogNow] = useState(true);
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(defaultTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const atLimit = !isPremium && savedMealsCount >= FREE_SAVED_MEALS_LIMIT;

  const totals = items.reduce((t, it) => ({
    cal: t.cal + (Number(it.cal) || 0),
    protein: t.protein + (Number(it.protein) || 0),
    carbs: t.carbs + (Number(it.carbs) || 0),
    fat: t.fat + (Number(it.fat) || 0),
  }), { cal: 0, protein: 0, carbs: 0, fat: 0 });

  async function submit() {
    if (!name.trim() || items.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), items, logNow && !isPremium ? meal : null, logNow && isPremium ? timeStringToDate(time, new Date(selectedDate + "T00:00:00")) : null);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save this meal. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Meal builder (${items.length})`} onClose={onClose}>
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--text-hint)", fontSize: 13 }}>
          No items yet — close this, then tap "+ Add to meal" on any food.
        </div>
      ) : atLimit ? (
        <div>
          <div style={{ background: "#1a1508", border: "1px solid #4a3a1a", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--gold)", marginBottom: 14 }}>
            You've saved {FREE_SAVED_MEALS_LIMIT} free saved meals — upgrade to Pro for unlimited, or delete an old one to make room.
          </div>
          <button onClick={onUpgrade} style={{ width: "100%", background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 8, padding: "9px", fontSize: 13, color: "var(--accent)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Upgrade to Pro
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < items.length - 1 ? "1px solid var(--border-default)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                <div style={{ fontSize: 12, color: "var(--accent)", flexShrink: 0 }}>{Math.round(it.cal)} kcal</div>
                <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 15, padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid var(--border-default)", fontSize: 12, color: "var(--text-muted)" }}>
            <span><span style={{ color: "var(--accent)", fontWeight: 600 }}>{Math.round(totals.cal)}</span> kcal</span>
            <span>P <span style={{ color: "var(--text-secondary)" }}>{Math.round(totals.protein)}g</span></span>
            <span>C <span style={{ color: "var(--text-secondary)" }}>{Math.round(totals.carbs)}g</span></span>
            <span>F <span style={{ color: "var(--text-secondary)" }}>{Math.round(totals.fat)}g</span></span>
          </div>
          <label style={labelStyle}>Meal name *</label>
          <input style={{ ...fieldStyle, marginBottom: 12 }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My usual breakfast" />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: logNow ? 12 : 16, cursor: "pointer" }}>
            <input type="checkbox" checked={logNow} onChange={e => setLogNow(e.target.checked)} />
            Also log to today
          </label>
          {logNow && (
            isPremium ? (
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...fieldStyle, marginBottom: 16, cursor: "pointer" }} />
            ) : (
              <select value={meal} onChange={e => setMeal(e.target.value)} style={{ ...fieldStyle, marginBottom: 16, cursor: "pointer" }}>
                {MEALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )
          )}
          {error && <div style={{ background: "#1a0f0f", border: "1px solid #c0707040", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
          <button onClick={submit} disabled={!name.trim() || saving} style={{ width: "100%", background: !name.trim() || saving ? "var(--border-default)" : "var(--accent)", border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 600, color: !name.trim() || saving ? "var(--text-muted)" : "#0f0f0f", cursor: !name.trim() || saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {saving ? "Saving…" : !logNow ? "Save meal" : isPremium ? `Save meal & log at ${formatTime12h(time)}` : `Save meal & log to ${meal}`}
          </button>
        </>
      )}
    </ModalShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function formatAmountUnit(amount, unitId) {
  const unitDef = UNITS.find(u => u.id === unitId);
  if (!unitDef) return `${amount}`;
  if (unitId === "serving") return `${amount} serving${amount === 1 ? "" : "s"}`;
  return `${amount}${unitDef.label}`;
}

function MacroPill({ value, unit = "g", label, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color }}>{value}{unit}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FoodCard({ food, isExpanded, onToggle, defaultMeal, defaultTime, selectedDate, isPremium, onAdd, addLabel, onDelete, isFavourite, onToggleFavourite }) {
  // Recent/Frequent/Favourites rows carry the amount+unit this exact food
  // was last logged with (see FoodSearch's lastAmount/lastUnit mapping) —
  // quick-add and the expanded editor both default to that instead of
  // always guessing 1 serving. Search results and custom foods have no
  // such history to draw on, so they keep the original 1-serving default.
  // This never touches the food's own servingGrams/base nutrition — it's
  // purely a starting point for the amount field.
  const hasRemembered = food.lastAmount != null && !!food.lastUnit;
  const defaultAmount = hasRemembered ? food.lastAmount : 1;
  const defaultUnit = hasRemembered ? food.lastUnit : "serving";

  const [amount, setAmount] = useState(defaultAmount);
  const [unit, setUnit] = useState(defaultUnit);
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(defaultTime);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => { setMeal(defaultMeal); }, [defaultMeal]);
  useEffect(() => { setTime(defaultTime); }, [defaultTime]);

  const servingGrams = food.servingGrams || 100;
  const servings = amountToServings(Number(amount) || 0, unit, servingGrams);
  const gramsEquivalent = Math.round(servings * servingGrams);
  // servingGrams on the scaled object is the actual weight THIS logged
  // amount represents (not the original food's per-serving weight) — so
  // that re-adding it later from "Recently/Frequently logged" scales from
  // an accurate baseline instead of guessing 100g every time. loggedAmount/
  // loggedUnit are what's actually typed/selected, kept separately so next
  // time's quick-add can remember it without redefining what "1 serving"
  // means for the food itself.
  const scaled = { ...scaleFood(food, servings || 0), servingGrams: gramsEquivalent, loggedAmount: Number(amount) || null, loggedUnit: unit };
  const catStyle = getCategoryStyle(food);

  // Deliberately NOT derived from the live `amount`/`unit`/`meal`/`time`
  // state above — those can already be mid-edit if the card was expanded
  // and then collapsed again without hitting Add. Quick-add always means
  // exactly "the remembered amount (or 1 serving if there isn't one), to
  // the current default meal/time" — computed fresh from defaultAmount/
  // defaultUnit, not whatever's currently typed into the (hidden) field.
  const defaultServings = amountToServings(defaultAmount, defaultUnit, servingGrams);
  const defaultGramsEquivalent = Math.round(defaultServings * servingGrams);
  const defaultScaled = { ...scaleFood(food, defaultServings), servingGrams: defaultGramsEquivalent, loggedAmount: defaultAmount, loggedUnit: defaultUnit };
  const quickAddLabel = formatAmountUnit(defaultAmount, defaultUnit);
  function handleQuickAdd(e) {
    e.stopPropagation();
    onAdd(defaultScaled, isPremium ? null : defaultMeal, isPremium ? timeStringToDate(defaultTime, new Date(selectedDate + "T00:00:00")) : null);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1100);
  }

  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${isExpanded ? "var(--accent-dark)" : "var(--border-default)"}`, borderRadius: 10, marginBottom: 8, overflow: "hidden", transition: "border-color 0.15s", cursor: "pointer" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", padding: "11px 14px", gap: 12 }}>
        <div style={{ width: 40, height: 40, background: catStyle.color + "22", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, color: catStyle.color }}><i className={`ti ${catStyle.icon}`} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {food.name}
            {food.source === "custom" && <span style={{ marginLeft: 8, fontSize: 10, color: "#b48fd9", border: "1px solid #b48fd950", borderRadius: 5, padding: "1px 6px", verticalAlign: "middle" }}>Custom</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{food.meta}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--accent)" }}>{food.cal}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}> kcal</span>
        </div>
        <button
          onClick={handleQuickAdd}
          disabled={justAdded}
          title={addLabel ? `Quick add — ${quickAddLabel} to meal builder` : `Quick add — ${quickAddLabel} to ${defaultMeal}`}
          style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: justAdded ? "var(--accent-bg)" : "var(--accent)", border: justAdded ? "1px solid var(--accent-dark)" : "none",
            color: justAdded ? "var(--accent)" : "#0f0f0f", fontSize: 15, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: justAdded ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          <i className={`ti ${justAdded ? "ti-check" : "ti-plus"}`} />
        </button>
        {onToggleFavourite && (
          <button onClick={(e) => { e.stopPropagation(); onToggleFavourite(); }} title={isFavourite ? "Remove favourite" : "Add favourite"} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, color: isFavourite ? "var(--gold)" : "var(--text-hint)", fontSize: 16, display: "flex" }}>
            <i className={isFavourite ? "ti ti-star-filled" : "ti ti-star"} />
          </button>
        )}
        <span style={{ fontSize: 13, color: "var(--text-hint)", marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
      </div>
      {isExpanded && (
        <div style={{ borderTop: "1px solid var(--border-default)", padding: "14px", background: "var(--bg-subtle)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
            <MacroPill value={scaled.protein} label="Protein" color="var(--accent)" />
            <MacroPill value={scaled.carbs} label="Carbs" color="var(--water-blue)" />
            <MacroPill value={scaled.fat} label="Fat" color="var(--warning)" />
            <MacroPill value={scaled.fibre} label="Fibre" color="var(--ai-purple)" />
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sodium <span style={{ color: "var(--text-secondary)" }}>{scaled.sodium}mg</span></div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sugar <span style={{ color: "var(--text-secondary)" }}>{scaled.sugar}g</span></div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{scaled.cal}</span> kcal{unit !== "g" && ` · ≈${gramsEquivalent}g`}
            </div>
          </div>
          <AddControls
            amount={amount} setAmount={setAmount}
            unit={unit} setUnit={setUnit}
            meal={meal} setMeal={setMeal}
            time={time} setTime={setTime}
            isPremium={isPremium}
            onAdd={() => onAdd(scaled, isPremium ? null : meal, isPremium ? timeStringToDate(time, new Date(selectedDate + "T00:00:00")) : null)}
            disabled={!servings}
            addLabel={addLabel}
          />
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ marginTop: 10, width: "100%", background: "none", border: "1px solid var(--border-default)", borderRadius: 8, padding: "7px", fontSize: 12, color: "var(--danger)", cursor: "pointer", fontFamily: "inherit" }}>
                <i className="ti ti-trash" style={{ marginRight: 5 }} />Delete custom food
              </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddControls({ amount, setAmount, unit, setUnit, meal, setMeal, time, setTime, isPremium, onAdd, disabled, addLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="number" min="0" step="any" value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ width: 70, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
        />
        <select value={unit} onChange={e => setUnit(e.target.value)} style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "7px 10px", color: "var(--text-secondary)", fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
          {UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        {isPremium ? (
          <input
            type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "7px 10px", color: "var(--text-secondary)", fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" }}
          />
        ) : (
          <select value={meal} onChange={e => setMeal(e.target.value)} style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "7px 10px", color: "var(--text-secondary)", fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
            {MEALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>
      <button
        onClick={onAdd}
        disabled={disabled}
        style={{ background: disabled ? "var(--border-default)" : "var(--accent)", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, color: disabled ? "var(--text-muted)" : "#0f0f0f", cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
      >
        {addLabel ? addLabel : isPremium ? `+ Add at ${formatTime12h(time)}` : `+ Add to ${meal}`}
      </button>
    </div>
  );
}

function Toast({ message, onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 2200 - 160);
    const doneTimer = setTimeout(onDone, 2200);
    return () => { clearTimeout(leaveTimer); clearTimeout(doneTimer); };
  }, [onDone]);
  return (
    <div className={leaving ? "toast-out" : "toast-in"} style={{ position: "fixed", bottom: 28, left: "50%", background: "var(--accent-bg)", border: "1px solid var(--accent-dark)", borderRadius: 10, padding: "10px 20px", color: "var(--accent)", fontSize: 14, zIndex: 100, whiteSpace: "nowrap", pointerEvents: "none" }}>
      ✓ {message}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FoodSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const isPremium = !!profile?.is_premium;
  const today = todayLocalDate();
  // DailyLog's per-day "+ Add food" links here with the date it was
  // clicked from (e.g. { date: "2026-08-27" }), so forgetting to log
  // something can be fixed after the fact instead of only ever landing
  // on today. Falls back to today for every other entry point (Dashboard
  // shortcuts, nav) and clamps out anything invalid or in the future.
  const [selectedDate, setSelectedDate] = useState(() => {
    const requested = location.state?.date;
    return requested && requested <= today ? requested : today;
  });
  const isToday = selectedDate === today;
  function shiftDate(days) {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    const next = todayLocalDate(d);
    if (next > today) return;
    setSelectedDate(next);
    setExpandedId(null);
  }
  const { addFood: addFoodLog } = useFoodLogs(selectedDate);
  // 20, not 6 — now that Recently/Frequently logged each get their own
  // full tab instead of a short stacked preview, they can afford to
  // actually show enough history to find yesterday's food in.
  const { rows: recentRows, loading: recentLoading, refetch: refetchRecent } = useRecentFoods(20);
  const customFoods = useCustomFoods();
  const savedMeals = useSavedMeals();
  const favourites = useFavouriteFoods();
  const frequent = useFrequentFoods(20);
  const lastLogged = useLastLoggedAmounts();
  const [query, setQuery] = useState("");
  // Dashboard's per-meal "+ Add food" links here with the meal it was
  // clicked from (e.g. { openMeal: "breakfast" }). Otherwise, default to
  // whatever meal actually fits the current time of day instead of always
  // landing on Lunch regardless of when you're logging.
  const [activeMeal, setActiveMeal] = useState(() => {
    const requested = location.state?.openMeal;
    if (requested) {
      const capitalized = requested.charAt(0).toUpperCase() + requested.slice(1);
      if (MEALS.includes(capitalized)) return capitalized;
    }
    const auto = mealFromDate(new Date());
    return auto.charAt(0).toUpperCase() + auto.slice(1);
  });
  // Pro users log against a real clock time instead of a meal category.
  // The hourly timeline's per-hour "+" links here with { presetTime:
  // "HH:00" } so logging lands at the hour you tapped instead of "now".
  const [activeTime, setActiveTime] = useState(() => location.state?.presetTime || currentTimeHHMM());
  const [expandedId, setExpandedId] = useState(null);
  const [mealDropdownOpen, setMealDropdownOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Dashboard's "Scan barcode" shortcut links here with { openScan: true }
  // to jump straight into the scanner instead of landing on plain search.
  // The quick-action sheet's "Scan photo" does the same with openPhotoScan.
  const [scanOpen, setScanOpen] = useState(!!location.state?.openScan);
  const [photoScanOpen, setPhotoScanOpen] = useState(!!location.state?.openPhotoScan);
  // The quick-action sheet's "Scan menu" does the same with openMenuScan.
  const [menuScanOpen, setMenuScanOpen] = useState(!!location.state?.openMenuScan);
  const [createFoodOpen, setCreateFoodOpen] = useState(false);
  // Dashboard's "Saved meals" shortcut links here with { openSavedMeals: true }.
  const [savedMealsOpen, setSavedMealsOpen] = useState(!!location.state?.openSavedMeals);
  const [builderMode, setBuilderMode] = useState(false);
  const [builderItems, setBuilderItems] = useState([]);
  const [builderReviewOpen, setBuilderReviewOpen] = useState(false);

  // Live external search state — FatSecret (generic foods, comprehensive
  // across every category) and Open Food Facts (packaged/branded products,
  // AU-scoped) are kept separate so they can render in different sections.
  const [genericResults, setGenericResults] = useState([]);
  const [packagedLive, setPackagedLive] = useState([]);
  const [afcdResults, setAfcdResults] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const searchTimer = useRef(null);

  // "Can't find it? Estimate with AI" — a fallback for dishes no
  // connected database has (regional/takeaway food), not a primary search
  // path. Keyed to the exact query it ran for, so switching the search
  // text doesn't leave a stale estimate visible.
  const [aiEstimateQuery, setAiEstimateQuery] = useState(null);
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiEstimateError, setAiEstimateError] = useState(null);
  const [aiEstimateResult, setAiEstimateResult] = useState(null);
  const [aiLimitReached, setAiLimitReached] = useState(false);

  async function handleAiEstimate() {
    const description = query.trim();
    if (!description) return;
    setAiEstimateQuery(description);
    setAiEstimating(true);
    setAiEstimateError(null);
    setAiLimitReached(false);
    setAiEstimateResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/estimate-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiEstimateError(data.error || "Couldn't estimate this food. Try again.");
        setAiLimitReached(!!data.limitReached);
        return;
      }
      setAiEstimateResult({
        id: 'ai_' + Date.now(),
        name: data.name,
        meta: `${data.portion || '1 serving'} · AI estimate${data.confidence === 'low' ? ' (low confidence)' : ''}`,
        cuisine: 'all',
        cal: Math.round(data.cal) || 0,
        protein: Math.round((data.protein || 0) * 10) / 10,
        carbs: Math.round((data.carbs || 0) * 10) / 10,
        fat: Math.round((data.fat || 0) * 10) / 10,
        fibre: Math.round((data.fibre || 0) * 10) / 10,
        sodium: Math.round(data.sodium || 0),
        sugar: Math.round((data.sugar || 0) * 10) / 10,
        source: 'ai-estimate',
        servingGrams: Math.round(data.servingGrams) || 100,
      });
    } catch (err) {
      console.error('AI estimate error:', err);
      setAiEstimateError("Couldn't reach the AI estimator. Check your connection and try again.");
    } finally {
      setAiEstimating(false);
    }
  }

  const inputRef = useRef(null);

  // Foods the user has created themselves — shown alongside everything
  // else, matched by name when searching.
  const customAsFoods = useMemo(() => customFoods.rows.map(row => ({
    id: "custom_" + row.id,
    customId: row.id,
    category: "custom",
    name: row.name,
    meta: (row.brand ? row.brand + " · " : "") + (row.serving_label || "1 serving"),
    cuisine: "all",
    cal: Number(row.calories) || 0,
    protein: Number(row.protein_g) || 0,
    carbs: Number(row.carbs_g) || 0,
    fat: Number(row.fat_g) || 0,
    fibre: Number(row.fibre_g) || 0,
    sodium: Number(row.sodium_mg) || 0,
    sugar: Number(row.sugar_g) || 0,
    servingGrams: row.serving_grams || 100,
    source: "custom",
  })), [customFoods.rows]);

  const customFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return customAsFoods;
    return customAsFoods.filter(f => f.name.toLowerCase().includes(q));
  }, [customAsFoods, query]);

  const runLiveSearch = useCallback(async (q) => {
    setLiveLoading(true);
    setLiveError(null);
    // Slang like "maccas" or "hsp" won't literally appear in any of these
    // databases under that name — search the expanded form instead
    // ("mcdonalds", "halal snack pack") when the query is recognised.
    const searchQuery = expandFoodSlang(q) || q;
    // Three independent sources — run them together instead of one after
    // another, so a search takes as long as the slowest of the three
    // rather than the sum of all three.
    const [offResult, fatSecretResult, afcdResult] = await Promise.allSettled([
      searchOpenFoodFacts(searchQuery),
      searchFatSecret(searchQuery),
      searchAfcd(searchQuery),
    ]);
    let off = [], fatSecretResults = [], afcd = [];
    if (offResult.status === "fulfilled") {
      off = offResult.value;
    } else {
      console.error("Open Food Facts search error:", offResult.reason);
      setLiveError("Packaged product search is temporarily unavailable — try again in a moment.");
    }
    if (fatSecretResult.status === "fulfilled") {
      fatSecretResults = fatSecretResult.value;
    } else {
      console.error("FatSecret search error:", fatSecretResult.reason);
    }
    if (afcdResult.status === "fulfilled") {
      afcd = afcdResult.value;
    } else {
      console.error("AFCD search error:", afcdResult.reason);
    }
    setGenericResults(fatSecretResults);
    setPackagedLive(off);
    setAfcdResults(afcd);
    setLiveLoading(false);
  }, []);

  // Trigger search with debounce when query changes
  useEffect(() => {
    clearTimeout(searchTimer.current);
    // Any change to the search text invalidates a previous AI estimate —
    // it was for different words, so keeping it visible (or its error)
    // would be stale and misleading.
    setAiEstimateQuery(null);
    setAiEstimateResult(null);
    setAiEstimateError(null);
    setAiLimitReached(false);
    if (!query.trim()) { setGenericResults([]); setPackagedLive([]); setAfcdResults([]); setLiveLoading(false); setLiveError(null); return; }
    setLiveLoading(true);
    searchTimer.current = setTimeout(() => runLiveSearch(query.trim()), 500);
    return () => clearTimeout(searchTimer.current);
  }, [query, runLiveSearch]);

  const foodsResults = useMemo(() => {
    if (!query.trim()) return [];
    // Custom foods first (the user's own data), then AFCD (Australian
    // government data — more accurate for local foods than FatSecret's
    // generic entries), then FatSecret's broader generic coverage.
    const combined = [...customFiltered, ...afcdResults, ...genericResults];
    const seen = new Set();
    return combined.filter(f => {
      const key = f.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customFiltered, afcdResults, genericResults, query]);

  // Packaged/branded results (Open Food Facts, AU-scoped) shown in their
  // own demoted section below — this is what stops a search like "chicken
  // thigh" from being drowned out by random supermarket SKUs before you
  // ever see the actual food.
  const packagedResults = useMemo(() => {
    if (!query.trim()) return [];
    const foodNames = new Set(foodsResults.map(f => f.name.toLowerCase()));
    return packagedLive.filter(f => !foodNames.has(f.name.toLowerCase())).slice(0, 8);
  }, [foodsResults, packagedLive, query]);

  const allResults = useMemo(() => [...foodsResults, ...packagedResults], [foodsResults, packagedResults]);

  const browsing = query === "";
  // Favourites/Frequently logged/Recently logged as tabs instead of a
  // stacked scroll — all three are now one tap away instead of requiring
  // a scroll past everything else to reach the bottom two.
  const [browseTab, setBrowseTab] = useState('favourites');

  const recentFoods = useMemo(() => recentRows.map(row => {
    const lastAmount = row.logged_amount != null ? Number(row.logged_amount) : null;
    const lastUnit = row.logged_unit || null;
    return {
      id: "recent_" + row.id,
      name: row.food_name,
      // Shows the amount that'll actually be quick-added (MyFitnessPal-style
      // "258 cal, 200g" row) instead of a generic "Logged before" whenever
      // there's a remembered amount to show.
      meta: lastAmount != null && lastUnit ? formatAmountUnit(lastAmount, lastUnit) : "Logged before",
      cuisine: "all",
      cal: Number(row.calories) || 0,
      protein: Number(row.protein_g) || 0,
      carbs: Number(row.carbs_g) || 0,
      fat: Number(row.fat_g) || 0,
      fibre: 0,
      sodium: 0,
      sugar: 0,
      servingGrams: row.serving_grams || 100,
      source: row.source || "log",
      // Row is already the most recent food_logs entry for this name, so
      // its own logged_amount/logged_unit *is* "last used" — no extra
      // lookup needed here.
      lastAmount,
      lastUnit,
    };
  }), [recentRows]);

  // Frequently logged (real log-count data) mapped to the same food-card
  // shape as everything else.
  const frequentFoods = useMemo(() => frequent.rows.map(row => {
    const lastAmount = row.logged_amount != null ? Number(row.logged_amount) : null;
    const lastUnit = row.logged_unit || null;
    return {
      id: "freq_" + row.id,
      name: row.food_name,
      meta: lastAmount != null && lastUnit ? formatAmountUnit(lastAmount, lastUnit) : "Logged often",
      cal: Number(row.calories) || 0,
      protein: Number(row.protein_g) || 0,
      carbs: Number(row.carbs_g) || 0,
      fat: Number(row.fat_g) || 0,
      fibre: 0,
      sodium: 0,
      sugar: 0,
      servingGrams: row.serving_grams || 100,
      source: row.source || "log",
      lastAmount,
      lastUnit,
    };
  }), [frequent.rows]);

  // Favourites the user has starred, snapshotted at favourite time. Not
  // sourced from food_logs directly, so "last used amount" comes from the
  // separate lastLogged lookup rather than the row itself.
  const favouriteFoods = useMemo(() => favourites.rows.map(row => {
    const last = lastLogged.map.get(row.name.trim().toLowerCase());
    return {
      id: "fav_" + row.id,
      name: row.name,
      meta: (row.brand ? row.brand + " · " : "") + (last ? formatAmountUnit(last.amount, last.unit) : (row.serving_label || "1 serving")),
      cal: Number(row.calories) || 0,
      protein: Number(row.protein_g) || 0,
      carbs: Number(row.carbs_g) || 0,
      fat: Number(row.fat_g) || 0,
      fibre: Number(row.fibre_g) || 0,
      sodium: Number(row.sodium_mg) || 0,
      sugar: Number(row.sugar_g) || 0,
      saturatedFat: Number(row.saturated_fat_g) || 0,
      transFat: Number(row.trans_fat_g) || 0,
      cholesterol: Number(row.cholesterol_mg) || 0,
      potassium: Number(row.potassium_mg) || 0,
      addedSugar: Number(row.added_sugar_g) || 0,
      vitaminD: Number(row.vitamin_d_mcg) || 0,
      calcium: Number(row.calcium_mg) || 0,
      iron: Number(row.iron_mg) || 0,
      servingGrams: row.serving_grams || 100,
      source: row.source || "favourite",
      lastAmount: last?.amount ?? null,
      lastUnit: last?.unit ?? null,
    };
  }), [favourites.rows, lastLogged.map]);

  // timeStringToDate anchors to "now" by default — pass this as the base
  // so a Pro user's exact-time logging still lands on the selected
  // (possibly backdated) day instead of silently recording today's date
  // with the right time-of-day, which is a real Postgres timestamp,
  // not just display text — a UI mismatch here would corrupt data,
  // not just look wrong.
  function selectedDateBase() {
    return new Date(selectedDate + "T00:00:00");
  }

  async function logFood(food, meal, loggedAt) {
    await addFoodLog(food, meal, loggedAt);
    refetchRecent(); lastLogged.refetch();
    setToast(`${food.name} added${meal ? ` to ${meal}` : loggedAt ? ` at ${formatTimeFromDate(loggedAt)}` : ""}`);
    setExpandedId(null);
  }

  function addToBuilder(food) {
    setBuilderItems(prev => [...prev, food]);
    setToast(`${food.name} added to meal builder`);
    setExpandedId(null);
  }

  function handleAdd(food, meal, loggedAt) {
    if (builderMode) return addToBuilder(food);
    return logFood(food, meal, loggedAt);
  }

  async function handleDeleteCustom(food) {
    await customFoods.remove(food.customId);
    setToast(`${food.name} removed`);
    setExpandedId(null);
  }

  function handleToggle(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function cancelBuilder() {
    setBuilderMode(false);
    setBuilderItems([]);
    setBuilderReviewOpen(false);
  }

  async function handleSaveBuilderMeal(name, items, mealToLog, timeToLog) {
    const snapshot = items.map(it => ({
      name: it.name, cal: it.cal, protein: it.protein, carbs: it.carbs,
      fat: it.fat, fibre: it.fibre || 0, sodium: it.sodium || 0, sugar: it.sugar || 0,
      saturatedFat: it.saturatedFat || 0, transFat: it.transFat || 0,
      cholesterol: it.cholesterol || 0, potassium: it.potassium || 0,
      addedSugar: it.addedSugar || 0, vitaminD: it.vitaminD || 0,
      calcium: it.calcium || 0, iron: it.iron || 0,
    }));
    await savedMeals.create(name, snapshot);
    const logging = mealToLog || timeToLog;
    if (logging) {
      for (const it of items) {
        await addFoodLog(it, mealToLog, timeToLog);
      }
      refetchRecent(); lastLogged.refetch();
    }
    setToast(`Saved "${name}"${mealToLog ? ` and logged to ${mealToLog}` : timeToLog ? ` and logged at ${formatTimeFromDate(timeToLog)}` : ""}`);
    cancelBuilder();
  }

  async function handleLogSavedMeal(savedMeal) {
    const items = savedMeal.items || [];
    // "Right now" but anchored to the selected day — matters when
    // backdating, since a Pro user's saved-meal quick-log should still
    // land on that day rather than silently jumping to today.
    const loggedAt = isPremium ? timeStringToDate(currentTimeHHMM(), selectedDateBase()) : null;
    for (const it of items) {
      await addFoodLog(it, isPremium ? null : activeMeal, loggedAt);
    }
    refetchRecent(); lastLogged.refetch();
    setToast(`${savedMeal.name} logged${isPremium ? ` at ${formatTimeFromDate(loggedAt)}` : ` to ${activeMeal}`}`);
    setSavedMealsOpen(false);
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "'DM Sans', sans-serif", display: "flex" }}>

      <AppNav active="food" />

      {/* ── Main content ── */}
      <div className="app-content-pad" style={{ flex: 1, overflow: "auto", minWidth: 0 }}>

        {/* Top bar */}
        <div className="page-pad-top" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 12px", paddingTop: 14, paddingBottom: 14, borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>Food search</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: isToday ? "transparent" : "#1a1508", border: isToday ? "none" : "1px solid #4a3a1a", borderRadius: 7, padding: isToday ? 0 : "3px 4px" }}>
              <button onClick={() => shiftDate(-1)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 15, display: "flex", padding: 3 }} aria-label="Previous day">
                <i className="ti ti-chevron-left" />
              </button>
              <span style={{ fontSize: 12, color: isToday ? "var(--text-muted)" : "var(--gold)", minWidth: 74, textAlign: "center" }}>
                {isToday ? "Today" : new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <button onClick={() => shiftDate(1)} disabled={isToday} style={{ background: "none", border: "none", color: isToday ? "var(--border-default)" : "var(--text-muted)", cursor: isToday ? "default" : "pointer", fontSize: 15, display: "flex", padding: 3 }} aria-label="Next day">
                <i className="ti ti-chevron-right" />
              </button>
            </div>
            {isPremium ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "4px 10px" }}>
                <span style={{ fontSize: 12, color: "var(--accent)" }}>Logging at</span>
                <input
                  type="time" value={activeTime} onChange={e => setActiveTime(e.target.value)}
                  style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none" }}
                />
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <button onClick={() => setMealDropdownOpen(o => !o)} style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "4px 10px", fontSize: 12, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  Adding to: {activeMeal} ▾
                </button>
                {mealDropdownOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden", zIndex: 50, minWidth: 140 }}>
                    {MEALS.map(m => <div key={m} onClick={() => { setActiveMeal(m); setMealDropdownOpen(false); }} style={{ padding: "9px 14px", fontSize: 13, color: m === activeMeal ? "var(--accent)" : "var(--text-secondary)", background: m === activeMeal ? "var(--accent-bg)" : "transparent", cursor: "pointer" }}>{m}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div onClick={() => setCreateFoodOpen(true)} title="Create a custom food" style={{ width: 32, height: 32, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, color: "var(--text-muted)" }}><i className="ti ti-plus" /></div>
            <div onClick={() => setSavedMealsOpen(true)} title="Saved meals" style={{ width: 32, height: 32, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, color: "var(--text-muted)" }}><i className="ti ti-bookmark" /></div>
          </div>
        </div>

        {/* Page body */}
        <div className="page-pad">

          {/* Search bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
            <i className="ti ti-search" style={{ color: "var(--text-muted)", fontSize: 18 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setExpandedId(null); }}
              placeholder="Search any food, dish, or product…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 15, fontFamily: "inherit" }}
            />
            {liveLoading && <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--text-hint)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
            {query && !liveLoading && <button onClick={() => { setQuery(""); setGenericResults([]); setPackagedLive([]); setLiveError(null); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>}
          </div>

          {/* Scan shortcuts — their own row below the search bar so they
              never crowd/overflow it on narrow phones (they used to live
              inline with the input and get cut off). */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div onClick={() => setScanOpen(true)} style={{ flex: 1, background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 8, padding: "9px 12px", color: "var(--accent)", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-dark)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-active)"}>
              <i className="ti ti-barcode" style={{ fontSize: 14 }} /> Scan barcode
            </div>
            <div onClick={() => setPhotoScanOpen(true)} style={{ flex: 1, background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 8, padding: "9px 12px", color: "var(--accent)", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-dark)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-active)"}>
              <i className="ti ti-camera" style={{ fontSize: 14 }} /> Scan photo
            </div>
          </div>

          {/* "Can't find it? Estimate with AI" — always visible whenever
              there's a search query, not just on zero results, since a
              real search can come back with plenty of results that are
              all just wrong matches (e.g. searching "HSP" and getting
              beer/sauce hits) rather than literally empty. Kept as a
              subtle text link, not a button, since it's a fallback for
              when the real databases miss something — not a primary way
              to log food. */}
          {!browsing && aiEstimateQuery !== query.trim() && (
            <button
              onClick={handleAiEstimate}
              disabled={aiEstimating}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "0 0 14px", color: "var(--text-muted)", fontSize: 12.5, cursor: aiEstimating ? "default" : "pointer", fontFamily: "inherit" }}
            >
              Can't find "{query.trim()}"? <span style={{ color: "var(--accent)", fontWeight: 600 }}>{aiEstimating ? "Estimating…" : "Estimate with AI →"}</span>
            </button>
          )}

          {!browsing && aiEstimateQuery === query.trim() && aiEstimateError && (
            <div style={{ background: "#1a0f0f", border: "1px solid #c0707040", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>
              {aiEstimateError}
              {!aiLimitReached && (
                <button onClick={handleAiEstimate} style={{ display: "block", marginTop: 6, background: "none", border: "none", color: "var(--danger)", textDecoration: "underline", cursor: "pointer", fontSize: 12.5, padding: 0, fontFamily: "inherit" }}>Try again</button>
              )}
            </div>
          )}

          {!browsing && aiEstimateQuery === query.trim() && aiEstimateResult && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-sparkles" style={{ fontSize: 12 }} /> AI estimate
              </div>
              <FoodCard
                food={aiEstimateResult}
                isExpanded={expandedId === aiEstimateResult.id}
                onToggle={() => handleToggle(aiEstimateResult.id)}
                defaultMeal={activeMeal} selectedDate={selectedDate}
                defaultTime={activeTime}
                isPremium={isPremium}
                onAdd={handleAdd}
                addLabel={builderMode ? "+ Add to meal" : undefined}
                isFavourite={favourites.isFavourite(aiEstimateResult.name)}
                onToggleFavourite={() => favourites.toggle(aiEstimateResult)}
              />
            </div>
          )}

          {/* Browsing (no search) — your own data: favourites, frequently
              logged, and recently logged, as tabs rather than a stacked
              scroll — all three are one tap away instead of needing a
              scroll past everything to reach the bottom two. No curated/
              hardcoded content — a search now finds real food via
              FatSecret, so a fake "Popular foods" list would only get in
              the way. */}
          {browsing && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", touchAction: "pan-x", overscrollBehaviorX: "contain" }}>
                {[
                  { id: "favourites", label: "Favourites" },
                  { id: "frequent", label: "Frequently logged" },
                  { id: "recent", label: "Recently logged" },
                ].map(tab => {
                  const isActive = browseTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setBrowseTab(tab.id)}
                      style={{
                        flex: "0 0 auto", padding: "8px 14px", borderRadius: 20,
                        border: `1px solid ${isActive ? "var(--border-active)" : "var(--border-default)"}`,
                        background: isActive ? "var(--accent-bg)" : "var(--bg-subtle)",
                        color: isActive ? "var(--accent)" : "var(--text-muted)",
                        fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {browseTab === "favourites" && (
                favouriteFoods.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-hint)", fontSize: 13, background: "var(--bg-subtle)", border: "1px dashed var(--border-default)", borderRadius: 10 }}>
                    Tap the star on any food to save it here
                  </div>
                ) : (
                  favouriteFoods.map(food => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      isExpanded={expandedId === food.id}
                      onToggle={() => handleToggle(food.id)}
                      defaultMeal={activeMeal} selectedDate={selectedDate}
                      defaultTime={activeTime}
                      isPremium={isPremium}
                      onAdd={handleAdd}
                      addLabel={builderMode ? "+ Add to meal" : undefined}
                      isFavourite={true}
                      onToggleFavourite={() => favourites.toggle(food)}
                    />
                  ))
                )
              )}

              {browseTab === "frequent" && (
                frequentFoods.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-hint)", fontSize: 13, background: "var(--bg-subtle)", border: "1px dashed var(--border-default)", borderRadius: 10 }}>
                    Log the same food more than once to see it here
                  </div>
                ) : (
                  frequentFoods.map(food => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      isExpanded={expandedId === food.id}
                      onToggle={() => handleToggle(food.id)}
                      defaultMeal={activeMeal} selectedDate={selectedDate}
                      defaultTime={activeTime}
                      isPremium={isPremium}
                      onAdd={handleAdd}
                      addLabel={builderMode ? "+ Add to meal" : undefined}
                      isFavourite={favourites.isFavourite(food.name)}
                      onToggleFavourite={() => favourites.toggle(food)}
                    />
                  ))
                )
              )}

              {browseTab === "recent" && (
                recentLoading ? null : recentFoods.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-hint)", fontSize: 13, background: "var(--bg-subtle)", border: "1px dashed var(--border-default)", borderRadius: 10 }}>
                    Log some food to see it here
                  </div>
                ) : (
                  recentFoods.map(food => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      isExpanded={expandedId === food.id}
                      onToggle={() => handleToggle(food.id)}
                      defaultMeal={activeMeal} selectedDate={selectedDate}
                      defaultTime={activeTime}
                      isPremium={isPremium}
                      onAdd={handleAdd}
                      addLabel={builderMode ? "+ Add to meal" : undefined}
                      isFavourite={favourites.isFavourite(food.name)}
                      onToggleFavourite={() => favourites.toggle(food)}
                    />
                  ))
                )
              )}
            </>
          )}

          {/* Search results */}
          {!browsing && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {liveLoading ? "Searching…" : `${allResults.length} result${allResults.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Foods — custom foods + FatSecret generic results
                  (raw/cooked/every-cut variants across every food category,
                  not brands) */}
              {foodsResults.length === 0 && !liveLoading && packagedResults.length === 0 && !liveError ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-hint)", fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  No foods found for "{query}"
                  <br />
                  <span style={{ fontSize: 12, color: "var(--text-hint)", marginTop: 8, display: "block" }}>Try a different search term, use the scan button, or create it yourself</span>
                  <button onClick={() => setCreateFoodOpen(true)} style={{ marginTop: 16, background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 8, padding: "9px 16px", fontSize: 13, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <i className="ti ti-plus" /> Create "{query}" as a custom food
                  </button>
                </div>
              ) : (
                foodsResults.map(food => (
                  <FoodCard
                    key={food.id}
                    food={food}
                    isExpanded={expandedId === food.id}
                    onToggle={() => handleToggle(food.id)}
                    defaultMeal={activeMeal} selectedDate={selectedDate}
                      defaultTime={activeTime}
                      isPremium={isPremium}
                    onAdd={handleAdd}
                    addLabel={builderMode ? "+ Add to meal" : undefined}
                    onDelete={food.source === "custom" ? () => handleDeleteCustom(food) : undefined}
                    isFavourite={favourites.isFavourite(food.name)}
                    onToggleFavourite={() => favourites.toggle(food)}
                  />
                ))
              )}

              {/* Can't find it — always available while searching, not just
                  on a dead-end, matching MyFitnessPal's "Can't find it? Add
                  a food" pattern */}
              {!liveLoading && foodsResults.length > 0 && (
                <div onClick={() => setCreateFoodOpen(true)} style={{ marginTop: 14, textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", background: "var(--bg-card)", border: "1px dashed var(--border-default)", borderRadius: 8 }}>
                  <i className="ti ti-plus" style={{ marginRight: 5 }} />Can't find "{query}"? Create a custom food
                </div>
              )}

              {/* Packaged/branded products — Open Food Facts, AU-scoped,
                  kept separate so brand noise never crowds out the actual
                  food */}
              {(liveLoading || packagedResults.length > 0 || liveError) && (
                <div style={{ marginTop: foodsResults.length > 0 ? 20 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Packaged products</span>
                    <span style={{ background: "#0a1520", border: "1px solid #2a4a6a", borderRadius: 6, padding: "2px 8px", fontSize: 10, color: "var(--water-blue)" }}>🌐 Live search</span>
                  </div>
                  {liveLoading ? (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>Searching…</div>
                  ) : liveError ? (
                    <div style={{ background: "#1a0f0f", border: "1px solid #c0707040", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--danger)" }}>{liveError}</div>
                  ) : (
                    packagedResults.map(food => (
                      <FoodCard
                        key={food.id}
                        food={food}
                        isExpanded={expandedId === food.id}
                        onToggle={() => handleToggle(food.id)}
                        defaultMeal={activeMeal} selectedDate={selectedDate}
                      defaultTime={activeTime}
                      isPremium={isPremium}
                        onAdd={handleAdd}
                        addLabel={builderMode ? "+ Add to meal" : undefined}
                        isFavourite={favourites.isFavourite(food.name)}
                        onToggleFavourite={() => favourites.toggle(food)}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* Required FatSecret Platform API attribution — must not be
              reworded per their attribution policy. */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <a href="https://platform.fatsecret.com" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--text-hint)" }}>Powered by fatsecret Platform API</a>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Meal builder floating bar */}
      {builderMode && (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "var(--bg-subtle)", border: "1px solid var(--accent-dark)", borderRadius: 12, padding: "10px 12px 10px 18px", display: "flex", alignItems: "center", gap: 12, zIndex: 90, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          <span style={{ fontSize: 13, color: "var(--accent)" }}>Building meal · {builderItems.length} item{builderItems.length !== 1 ? "s" : ""}</span>
          <button onClick={() => setBuilderReviewOpen(true)} style={{ background: "var(--accent)", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#0f0f0f", cursor: "pointer", fontFamily: "inherit" }}>Review & save</button>
          <button onClick={cancelBuilder} style={{ background: "none", border: "1px solid var(--border-default)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      )}

      {/* Scan modal */}
      {scanOpen && (
        <BarcodeScanner
          onClose={() => setScanOpen(false)}
          defaultMeal={activeMeal} selectedDate={selectedDate}
          defaultTime={activeTime}
          isPremium={isPremium}
          onAddFood={async (food, meal, loggedAt) => { await addFoodLog(food, meal, loggedAt); refetchRecent(); lastLogged.refetch(); setToast(`${food.name} added${meal ? ` to ${meal}` : loggedAt ? ` at ${formatTimeFromDate(loggedAt)}` : ''}`); }}
          onCreateCustom={() => { setScanOpen(false); setCreateFoodOpen(true); }}
          onSearchManually={() => { setScanOpen(false); setTimeout(() => inputRef.current?.focus(), 0); }}
        />
      )}

      {/* Photo scan modal */}
      {photoScanOpen && (
        <PhotoScanModal
          onClose={() => setPhotoScanOpen(false)}
          defaultMeal={activeMeal} selectedDate={selectedDate}
          defaultTime={activeTime}
          isPremium={isPremium}
          onAddFood={async (food, meal, loggedAt) => { await addFoodLog(food, meal, loggedAt); refetchRecent(); lastLogged.refetch(); setToast(`${food.name} added${meal ? ` to ${meal}` : loggedAt ? ` at ${formatTimeFromDate(loggedAt)}` : ''}`); }}
          onCreateCustom={() => { setPhotoScanOpen(false); setCreateFoodOpen(true); }}
          onSearchManually={() => { setPhotoScanOpen(false); setTimeout(() => inputRef.current?.focus(), 0); }}
        />
      )}

      {/* Menu scan modal */}
      {menuScanOpen && (
        <MenuScanModal
          onClose={() => setMenuScanOpen(false)}
          isPremium={isPremium}
          onAddFood={async (food, meal, loggedAt) => { await addFoodLog(food, meal, loggedAt); refetchRecent(); lastLogged.refetch(); setToast(`${food.name} added${meal ? ` to ${meal}` : loggedAt ? ` at ${formatTimeFromDate(loggedAt)}` : ''}`); }}
          onSearchManually={() => { setMenuScanOpen(false); setTimeout(() => inputRef.current?.focus(), 0); }}
        />
      )}

      {/* Create a custom food */}
      {createFoodOpen && (
        <CreateFoodModal
          onClose={() => setCreateFoodOpen(false)}
          initialName={query}
          onCreate={async (food) => {
            await customFoods.create(food);
            setToast(`"${food.name}" saved as a custom food`);
          }}
        />
      )}

      {/* Saved meals */}
      {savedMealsOpen && (
        <SavedMealsModal
          meals={savedMeals.rows}
          loading={savedMeals.loading}
          onClose={() => setSavedMealsOpen(false)}
          onLog={handleLogSavedMeal}
          onDelete={(id) => savedMeals.remove(id)}
          onStartBuilder={() => { setSavedMealsOpen(false); setBuilderMode(true); setBuilderItems([]); }}
        />
      )}

      {/* Meal builder review */}
      {builderReviewOpen && (
        <BuilderReviewModal
          items={builderItems}
          defaultMeal={activeMeal} selectedDate={selectedDate}
                      defaultTime={activeTime}
                      isPremium={isPremium}
          savedMealsCount={savedMeals.rows.length}
          onUpgrade={() => navigate('/settings')}
          onClose={() => setBuilderReviewOpen(false)}
          onRemove={(i) => setBuilderItems(prev => prev.filter((_, idx) => idx !== i))}
          onSave={handleSaveBuilderMeal}
        />
      )}
    </div>
  );
}
