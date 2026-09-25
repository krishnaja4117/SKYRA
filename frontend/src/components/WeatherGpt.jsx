import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import { getLiveWeather } from "../weatherApi";
import { analyzeHistoricalPatterns } from "../services/historicalIntelligence";
import { getCurrentLocationOrFallback, DEMO_FALLBACK_LOCATION } from "../services/locationService";

// ─── DEMO / FALLBACK coordinates ─────────────────────────────────────────────
// Used ONLY when the user's live GPS location cannot be obtained.
// Replaced at runtime by the result from locationService.getCurrentLocationOrFallback().
const BHUBANESWAR = { latitude: 20.2961, longitude: 85.8245, name: "Bhubaneswar" };

// ─── Supported voice / response languages ────────────────────────────────────
const VOICE_LANGUAGES = [
  { label: "English",   code: "en-IN" },
  { label: "Hindi",     code: "hi-IN" },
  { label: "Malayalam", code: "ml-IN" },
  { label: "Tamil",     code: "ta-IN" },
  { label: "Telugu",    code: "te-IN" },
  { label: "Kannada",   code: "kn-IN" },
];

// ─── Localized response templates ────────────────────────────────────────────
// Keys used inside templates:
//   {loc}   – location name (Bhubaneswar)
//   {temp}  – temperature °C  (rounded integer)
//   {hum}   – humidity %      (rounded integer)
//   {wind}  – wind speed km/h (rounded integer)
//   {rain}  – current rainfall mm
//   {prob}  – rain probability %
//   {hours} – forecast hours count
//   {maxProb} – highest forecast rain probability %
//   {totalRain} – total expected rainfall mm (1 decimal)
//   {riskLevel}  – ML risk level string
//   {riskScore}  – ML risk score /100
//   {confidence} – ML confidence %
//   {advice}     – localized risk advice string (injected separately)
//   {timing}     – "Analyzed in X.Xs."
//   {fresh}      – freshness note (empty string or warning)
//
// Each language object has:
//   greeting, listening, heardQ,
//   weatherLoading, riskLoading,
//   weatherUnavailable, weatherIncomplete, riskUnavailable,
//   forecastUnavailable, riskIncomplete, riskApiError,
//   weather, temperature, wind, humidity,
//   rainYes, rainNo, rainNoProb,
//   forecastToday, forecastTomorrow,
//   risk,
//   unsupported,
//   riskAdvice: { Severe, High, Moderate, Low }
const RESPONSES = {
  "en-IN": {
    greeting:            "Hello! I am SKYRA. Ask me about the current weather, rainfall, humidity, wind, forecast, or disaster risk.",
    listening:           "Listening in English... Speak your weather or safety question.",
    heardQ:              "I heard your question. Press Send when you are ready.",
    weatherLoading:      "SKYRA is checking the latest conditions...",
    riskLoading:         "SKYRA is analyzing the current weather risk...",
    weatherUnavailable:  "Live weather is temporarily unavailable. Please try again shortly.",
    weatherIncomplete:   "Live weather is temporarily incomplete. Please try again shortly.",
    riskUnavailable:     "Risk analysis is temporarily unavailable. Live weather questions are still available when weather data can be loaded.",
    forecastUnavailable: "Forecast unavailable for the requested period. {timing}{fresh}",
    riskIncomplete:      "Live weather is missing information needed for risk analysis. Please try again shortly.",
    riskApiError:        "Risk analysis is temporarily unavailable. Live weather questions are still available when weather data can be loaded.",
    weather:             "Current weather in {loc}: {temp}\u00b0C, {hum}% humidity, wind at {wind} km/h, and {rain} mm rainfall. {timing}{fresh}",
    temperature:         "The current temperature in {loc} is {temp}\u00b0C. {timing}{fresh}",
    wind:                "The current wind speed in {loc} is {wind} km/h. {timing}{fresh}",
    humidity:            "The current humidity in {loc} is {hum}%. {timing}{fresh}",
    rainYes:             "Yes, it is currently raining in {loc}. Current rainfall is {rain} mm. {timing}{fresh}",
    rainNo:              "It is not currently raining in {loc}. Current rainfall is {rain} mm and the latest hourly rain probability is {prob}%. {timing}{fresh}",
    rainNoProb:          "Current rainfall is {rain} mm, but the latest rain probability is unavailable. {timing}{fresh}",
    forecastToday:       "Later today, the available {hours}-hour forecast shows up to {maxProb}% rain probability and {totalRain} mm expected rainfall. {timing}{fresh}",
    forecastTomorrow:    "Tomorrow, the available {hours}-hour forecast shows up to {maxProb}% rain probability and {totalRain} mm expected rainfall. {timing}{fresh}",
    risk:                "Current risk in {loc}: {riskLevel} ({riskScore}/100). Confidence: {confidence}%. Advice: {advice} {timing}{fresh}",
    historyLoading:      "SKYRA is analysing historical patterns for current conditions...",
    history:             "Historical Pattern Intelligence for {loc} \u2014 Pattern Match: {patternMatch}% ({similarityLevel}). Similar past events found: {similarEventCount}. Historical risk context: {historicalRisk}. Most common past impact: {commonImpact} ({impactLikelihood}% of similar events).{trendLine} {explanation} \u2014 Data: {dataCoverage}. Source: {dataSource}.",
    historyLowData:      "Historical analysis found only {similarEventCount} closely matching event(s) in the demo dataset. Pattern Match: {patternMatch}%. Most common past impact: {commonImpact}. Data: {dataCoverage}.",
    historyNoData:       "Current conditions could not be matched against historical records. Please ensure live weather data is available.",
    unsupported:         "I can help with current weather, rain, forecast, temperature, wind, humidity, SKYRA risk or safety guidance, and historical pattern intelligence. Try asking \"What happened here before?\" or \"Will it rain later today?\"",
    riskAdvice: {
      Severe:   "Stay alert and follow official weather and disaster advisories.",
      High:     "Take precautions, avoid unnecessary travel, and monitor official weather alerts.",
      Moderate: "Stay aware of changing conditions and monitor official advisories.",
      Low:      "No major immediate weather risk is indicated by SKYRA.",
    },
  },

  "hi-IN": {
    greeting:            "नमस्ते! मैं SKYRA हूँ। मुझसे मौसम, बारिश, नमी, हवा, पूर्वानुमान या आपदा जोखिम के बारे में पूछें।",
    listening:           "हिंदी में सुन रहा हूँ... अपना मौसम या सुरक्षा संबंधी प्रश्न बोलें।",
    heardQ:              "मैंने आपका प्रश्न सुन लिया। तैयार होने पर Send दबाएँ।",
    weatherLoading:      "SKYRA नवीनतम मौसम की जाँच कर रहा है...",
    riskLoading:         "SKYRA वर्तमान मौसम जोखिम का विश्लेषण कर रहा है...",
    weatherUnavailable:  "लाइव मौसम डेटा अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद प्रयास करें।",
    weatherIncomplete:   "लाइव मौसम डेटा अभी अपूर्ण है। कृपया थोड़ी देर बाद प्रयास करें।",
    riskUnavailable:     "जोखिम विश्लेषण अभी उपलब्ध नहीं है। मौसम डेटा लोड होने पर मौसम संबंधी प्रश्न उपलब्ध हैं।",
    forecastUnavailable: "इस अवधि के लिए पूर्वानुमान उपलब्ध नहीं है। {timing}{fresh}",
    riskIncomplete:      "जोखिम विश्लेषण के लिए आवश्यक मौसम जानकारी उपलब्ध नहीं है। कृपया थोड़ी देर बाद प्रयास करें।",
    riskApiError:        "जोखिम विश्लेषण अभी उपलब्ध नहीं है। मौसम डेटा लोड होने पर मौसम संबंधी प्रश्न उपलब्ध हैं।",
    weather:             "{loc} में वर्तमान मौसम: तापमान {temp}\u00b0C, आर्द्रता {hum}%, हवा की गति {wind} km/h, और {rain} mm वर्षा। {timing}{fresh}",
    temperature:         "{loc} में वर्तमान तापमान {temp}\u00b0C है। {timing}{fresh}",
    wind:                "{loc} में हवा की वर्तमान गति {wind} km/h है। {timing}{fresh}",
    humidity:            "{loc} में वर्तमान आर्द्रता {hum}% है। {timing}{fresh}",
    rainYes:             "हाँ, {loc} में अभी बारिश हो रही है। वर्तमान वर्षा {rain} mm है। {timing}{fresh}",
    rainNo:              "{loc} में अभी बारिश नहीं हो रही है। वर्तमान वर्षा {rain} mm है और वर्षा की संभावना {prob}% है। {timing}{fresh}",
    rainNoProb:          "वर्तमान वर्षा {rain} mm है, लेकिन वर्षा संभावना डेटा उपलब्ध नहीं है। {timing}{fresh}",
    forecastToday:       "आज बाद में {hours} घंटे के पूर्वानुमान में {maxProb}% तक वर्षा की संभावना और {totalRain} mm अपेक्षित वर्षा है। {timing}{fresh}",
    forecastTomorrow:    "कल के {hours} घंटे के पूर्वानुमान में {maxProb}% तक वर्षा की संभावना और {totalRain} mm अपेक्षित वर्षा है। {timing}{fresh}",
    risk:                "{loc} में वर्तमान जोखिम: {riskLevel} ({riskScore}/100)। Confidence: {confidence}%। सलाह: {advice} {timing}{fresh}",
    historyLoading:      "SKYRA वर्तमान परिस्थितियों के लिए ऐतिहासिक पैटर्न का विश्लेषण कर रहा है...",
    history:             "{loc} के लिए ऐतिहासिक पैटर्न विश्लेषण \u2014 पैटर्न मिलान: {patternMatch}% ({similarityLevel})। समान पुराने घटनाएं: {similarEventCount}। ऐतिहासिक जोखिम: {historicalRisk}। सबसे आम प्रभाव: {commonImpact} ({impactLikelihood}% समान घटनाओं में)।{trendLine} {explanation} \u2014 डेटा: {dataCoverage}।",
    historyLowData:      "ऐतिहासिक विश्लेषण में केवल {similarEventCount} मिलती-जुलती घटनाएं मिलीं। पैटर्न मिलान: {patternMatch}%। सामान्य प्रभाव: {commonImpact}।",
    historyNoData:       "वर्तमान परिस्थितियों को ऐतिहासिक रिकॉर्ड से मिलाया नहीं जा सका। कृपया सुनिश्चित करें कि लाइव मौसम डेटा उपलब्ध है।",
    unsupported:         "मैं मौसम, बारिश, पूर्वानुमान, तापमान, हवा, आर्द्रता, SKYRA जोखिम और ऐतिहासिक पैटर्न विश्लेषण में मदद कर सकता हूँ।",
    riskAdvice: {
      Severe:   "सतर्क रहें और आधिकारिक मौसम एवं आपदा सलाह का पालन करें।",
      High:     "सावधानी बरतें, अनावश्यक यात्रा से बचें और आधिकारिक मौसम अलर्ट की निगरानी करें।",
      Moderate: "बदलती परिस्थितियों के प्रति जागरूक रहें और आधिकारिक सलाह देखते रहें।",
      Low:      "SKYRA के अनुसार अभी कोई बड़ा तत्काल मौसम जोखिम नहीं है।",
    },
  },

  "ml-IN": {
    greeting:            "നമസ്കാരം! ഞാൻ SKYRA ആണ്. കാലാവസ്ഥ, മഴ, ആർദ്രത, കാറ്റ്, പ്രവചനം അല്ലെങ്കിൽ ദുരന്ത അപകടസാധ്യത എന്നിവയെക്കുറിച്ച് എന്നോട് ചോദിക്കൂ.",
    listening:           "മലയാളത്തിൽ കേൾക്കുന്നു... നിങ്ങളുടെ കാലാവസ്ഥ അല്ലെങ്കിൽ സുരക്ഷ ചോദ്യം പറയൂ.",
    heardQ:              "നിങ്ങളുടെ ചോദ്യം കേട്ടു. തയ്യാറാകുമ്പോൾ Send അമർത്തൂ.",
    weatherLoading:      "SKYRA ഏറ്റവും പുതിയ കാലാവസ്ഥ പരിശോധിക്കുന്നു...",
    riskLoading:         "SKYRA നിലവിലെ അപകടസാധ്യത വിശകലനം ചെയ്യുന്നു...",
    weatherUnavailable:  "ലൈവ് കാലാവസ്ഥ ഡേറ്റ ഇപ്പോൾ ലഭ്യമല്ല. കുറച്ചു സമയം കഴിഞ്ഞ് ശ്രമിക്കൂ.",
    weatherIncomplete:   "ലൈവ് കാലാവസ്ഥ ഡേറ്റ ഇപ്പോൾ അപൂർണ്ണമാണ്. കുറച്ചു സമയം കഴിഞ്ഞ് ശ്രമിക്കൂ.",
    riskUnavailable:     "അപകടസാധ്യത വിശകലനം ഇപ്പോൾ ലഭ്യമല്ല. കാലാവസ്ഥ ഡേറ്റ ലോഡ് ആകുമ്പോൾ കാലാവസ്ഥ ചോദ്യങ്ങൾ ചോദിക്കാം.",
    forecastUnavailable: "ആ കാലയളവിൽ പ്രവചനം ലഭ്യമല്ല. {timing}{fresh}",
    riskIncomplete:      "അപകടസാധ്യത വിശകലനത്തിന് ആവശ്യമായ കാലാവസ്ഥ വിവരങ്ങൾ ലഭ്യമല്ല. കുറച്ചു സമയം കഴിഞ്ഞ് ശ്രമിക്കൂ.",
    riskApiError:        "അപകടസാധ്യത വിശകലനം ഇപ്പോൾ ലഭ്യമല്ല. കാലാവസ്ഥ ഡേറ്റ ലോഡ് ആകുമ്പോൾ കാലാവസ്ഥ ചോദ്യങ്ങൾ ചോദിക്കാം.",
    weather:             "{loc}-ലെ നിലവിലെ കാലാവസ്ഥ: താപനില {temp}\u00b0C, ആർദ്രത {hum}%, കാറ്റിന്റെ വേഗത {wind} km/h, മഴ {rain} mm. {timing}{fresh}",
    temperature:         "{loc}-ലെ നിലവിലെ താപനില {temp}\u00b0C ആണ്. {timing}{fresh}",
    wind:                "{loc}-ലെ നിലവിലെ കാറ്റിന്റെ വേഗത {wind} km/h ആണ്. {timing}{fresh}",
    humidity:            "{loc}-ലെ നിലവിലെ ആർദ്രത {hum}% ആണ്. {timing}{fresh}",
    rainYes:             "അതെ, {loc}-ൽ ഇപ്പോൾ മഴ പെയ്യുന്നുണ്ട്. നിലവിലെ മഴ {rain} mm ആണ്. {timing}{fresh}",
    rainNo:              "{loc}-ൽ ഇപ്പോൾ മഴ പെയ്യുന്നില്ല. നിലവിലെ മഴ {rain} mm ഉം മഴ സാധ്യത {prob}% ഉം ആണ്. {timing}{fresh}",
    rainNoProb:          "നിലവിലെ മഴ {rain} mm ആണ്, എന്നാൽ മഴ സാധ്യത ഡേറ്റ ലഭ്യമല്ല. {timing}{fresh}",
    forecastToday:       "ഇന്ന് പിന്നീട്, {hours} മണിക്കൂർ പ്രവചനത്തിൽ {maxProb}% വരെ മഴ സാധ്യതയും {totalRain} mm പ്രതീക്ഷിത മഴയും കാണുന്നു. {timing}{fresh}",
    forecastTomorrow:    "നാളെ, {hours} മണിക്കൂർ പ്രവചനത്തിൽ {maxProb}% വരെ മഴ സാധ്യതയും {totalRain} mm പ്രതീക്ഷിത മഴയും കാണുന്നു. {timing}{fresh}",
    risk:                "{loc}-ലെ നിലവിലെ അപകടസാധ്യത: {riskLevel} ({riskScore}/100). Confidence: {confidence}%. ഉപദേശം: {advice} {timing}{fresh}",
    historyLoading:      "SKYRA നിലവിലെ കാലാവസ്ഥയ്ക്കായി ചരിത്ര പ്രതിരൂപ വിശകലനം നടത്തുന്നു...",
    history:             "{loc}-ലെ ചരിത്ര പ്രതിരൂപ വിശകലനം \u2014 പ്രതിരൂപ പൊരുത്തം: {patternMatch}% ({similarityLevel}). സമാന ചരിത്ര സംഭവങ്ങൾ: {similarEventCount}. ചരിത്ര അപകടസാധ്യത: {historicalRisk}. ഏറ്റവും സാധാരണ ആഘാതം: {commonImpact} ({impactLikelihood}% സമാന സംഭവങ്ങളിൽ).{trendLine} {explanation} \u2014 ഡേറ്റ: {dataCoverage}.",
    historyLowData:      "ചരിത്ര വിശകലനത്തിൽ {similarEventCount} സമാന സംഭവ(ങ്ങൾ) മാത്രം കണ്ടെത്തി. പ്രതിരൂപ പൊരുത്തം: {patternMatch}%. സാധാരണ ആഘാതം: {commonImpact}.",
    historyNoData:       "നിലവിലെ കാലാവസ്ഥ ചരിത്ര രേഖകളുമായി ഒത്തുനോക്കാൻ കഴിഞ്ഞില്ല. ലൈവ് കാലാവസ്ഥ ഡേറ്റ ലഭ്യമാണെന്ന് ഉറപ്പ് വരുത്തൂ.",
    unsupported:         "എനിക്ക് കാലാവസ്ഥ, മഴ, പ്രവചനം, താപനില, കാറ്റ്, ആർദ്രത, SKYRA അപകടസാധ്യത, ചരിത്ര പ്രതിരൂപ വിശകലനം എന്നിവയിൽ സഹായിക്കാൻ കഴിയും.",
    riskAdvice: {
      Severe:   "ജാഗ്രത പാലിക്കൂ, ഔദ്യോഗിക കാലാവസ്ഥ, ദുരന്ത അറിയിപ്പുകൾ പിന്തുടരൂ.",
      High:     "മുൻകരുതലുകൾ എടുക്കൂ, അനാവശ്യ യാത്ര ഒഴിവാക്കൂ, ഔദ്യോഗിക കാലാവസ്ഥ അലേർട്ടുകൾ ശ്രദ്ധിക്കൂ.",
      Moderate: "മാറുന്ന കാലാവസ്ഥ ശ്രദ്ധിക്കൂ, ഔദ്യോഗിക അറിയിപ്പുകൾ നിരീക്ഷിക്കൂ.",
      Low:      "SKYRA അനുസരിച്ച് ഇപ്പോൾ വലിയ കാലാവസ്ഥ അപകടസാധ്യതയൊന്നും ഇല്ല.",
    },
  },

  "ta-IN": {
    greeting:            "வணக்கம்! நான் SKYRA. வானிலை, மழை, ஈரப்பதம், காற்று, முன்னறிவிப்பு அல்லது பேரிடர் அபாயம் பற்றி என்னிடம் கேளுங்கள்.",
    listening:           "தமிழில் கேட்கிறேன்... உங்கள் வானிலை அல்லது பாதுகாப்பு கேள்வியைக் கேளுங்கள்.",
    heardQ:              "உங்கள் கேள்வியைக் கேட்டேன். தயாரானதும் Send அழுத்துங்கள்.",
    weatherLoading:      "SKYRA சமீபத்திய தரவை சரிபார்க்கிறது...",
    riskLoading:         "SKYRA தற்போதைய வானிலை அபாயத்தை பகுப்பாய்வு செய்கிறது...",
    weatherUnavailable:  "நேரடி வானிலை தரவு இப்போது கிடைக்கவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    weatherIncomplete:   "நேரடி வானிலை தரவு இப்போது முழுமையடையவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    riskUnavailable:     "அபாய பகுப்பாய்வு இப்போது கிடைக்கவில்லை. தரவு ஏற்றப்பட்டதும் வானிலை கேள்விகள் கேட்கலாம்.",
    forecastUnavailable: "கோரப்பட்ட காலத்திற்கு முன்னறிவிப்பு கிடைக்கவில்லை. {timing}{fresh}",
    riskIncomplete:      "அபாய பகுப்பாய்விற்கு தேவையான வானிலை தகவல் இல்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    riskApiError:        "அபாய பகுப்பாய்வு இப்போது கிடைக்கவில்லை. தரவு ஏற்றப்பட்டதும் வானிலை கேள்விகள் கேட்கலாம்.",
    weather:             "{loc}-ல் தற்போதைய வானிலை: வெப்பநிலை {temp}\u00b0C, ஈரப்பதம் {hum}%, காற்று வேகம் {wind} km/h, மழை {rain} mm. {timing}{fresh}",
    temperature:         "{loc}-ல் தற்போதைய வெப்பநிலை {temp}\u00b0C. {timing}{fresh}",
    wind:                "{loc}-ல் தற்போதைய காற்று வேகம் {wind} km/h. {timing}{fresh}",
    humidity:            "{loc}-ல் தற்போதைய ஈரப்பதம் {hum}%. {timing}{fresh}",
    rainYes:             "ஆம், {loc}-ல் இப்போது மழை பெய்கிறது. தற்போதைய மழை {rain} mm. {timing}{fresh}",
    rainNo:              "{loc}-ல் இப்போது மழை இல்லை. தற்போதைய மழை {rain} mm மற்றும் மழை வாய்ப்பு {prob}%. {timing}{fresh}",
    rainNoProb:          "தற்போதைய மழை {rain} mm, ஆனால் மழை வாய்ப்பு தரவு கிடைக்கவில்லை. {timing}{fresh}",
    forecastToday:       "இன்று பிறகு, {hours} மணி நேர முன்னறிவிப்பில் {maxProb}% வரை மழை வாய்ப்பும் {totalRain} mm மழையும் எதிர்பார்க்கப்படுகிறது. {timing}{fresh}",
    forecastTomorrow:    "நாளை, {hours} மணி நேர முன்னறிவிப்பில் {maxProb}% வரை மழை வாய்ப்பும் {totalRain} mm மழையும் எதிர்பார்க்கப்படுகிறது. {timing}{fresh}",
    risk:                "{loc}-ல் தற்போதைய அபாயம்: {riskLevel} ({riskScore}/100). Confidence: {confidence}%. ஆலோசனை: {advice} {timing}{fresh}",
    historyLoading:      "SKYRA தற்போதைய நிலைமைகளுக்கான வரலாற்று முறை பகுப்பாய்வு செய்கிறது...",
    history:             "{loc} வரலாற்று முறை நுண்ணறிவு \u2014 முறை பொருத்தம்: {patternMatch}% ({similarityLevel}). ஒத்த கடந்தகால நிகழ்வுகள்: {similarEventCount}. வரலாற்று அபாயம்: {historicalRisk}. மிகவும் பொதுவான தாக்கம்: {commonImpact} ({impactLikelihood}% ஒத்த நிகழ்வுகளில்).{trendLine} {explanation} \u2014 தரவு: {dataCoverage}.",
    historyLowData:      "வரலாற்று பகுப்பாய்வில் {similarEventCount} பொருத்தமான நிகழ்வு(கள்) மட்டுமே கண்டறியப்பட்டது. முறை பொருத்தம்: {patternMatch}%. பொதுவான தாக்கம்: {commonImpact}.",
    historyNoData:       "தற்போதைய நிலைமைகளை வரலாற்று பதிவுகளுடன் பொருத்த இயலவில்லை. நேரடி வானிலை தரவு கிடைக்கிறதா என சரிபார்க்கவும்.",
    unsupported:         "வானிலை, மழை, முன்னறிவிப்பு, வெப்பநிலை, காற்று, ஈரப்பதம், SKYRA அபாயம் மற்றும் வரலாற்று முறை பகுப்பாய்வில் உதவ முடியும்.",
    riskAdvice: {
      Severe:   "விழிப்பாக இருங்கள், அதிகாரப்பூர்வ வானிலை மற்றும் பேரிடர் அறிவிப்புகளை பின்பற்றுங்கள்.",
      High:     "முன்னெச்சரிக்கை எடுங்கள், தேவையற்ற பயணங்களை தவிருங்கள், அதிகாரப்பூர்வ எச்சரிக்கைகளை கவனிக்கவும்.",
      Moderate: "மாறும் சூழல்களை கவனியுங்கள், அதிகாரப்பூர்வ அறிவிப்புகளை பின்தொடருங்கள்.",
      Low:      "SKYRA படி இப்போது பெரிய வானிலை அபாயம் இல்லை.",
    },
  },

  "te-IN": {
    greeting:            "నమస్కారం! నేను SKYRA. వాతావరణం, వర్షం, తేమ, గాలి, సూచన లేదా విపత్తు ప్రమాదం గురించి నన్ను అడగండి.",
    listening:           "తెలుగులో వింటున్నాను... మీ వాతావరణం లేదా భద్రత ప్రశ్న చెప్పండి.",
    heardQ:              "మీ ప్రశ్న విన్నాను. సిద్ధంగా ఉన్నప్పుడు Send నొక్కండి.",
    weatherLoading:      "SKYRA తాజా డేటాను తనిఖీ చేస్తోంది...",
    riskLoading:         "SKYRA ప్రస్తుత వాతావరణ ప్రమాదాన్ని విశ్లేషిస్తోంది...",
    weatherUnavailable:  "లైవ్ వాతావరణ డేటా ప్రస్తుతం అందుబాటులో లేదు. కొంచెం సేపు తర్వాత మళ్ళీ ప్రయత్నించండి.",
    weatherIncomplete:   "లైవ్ వాతావరణ డేటా ప్రస్తుతం అసంపూర్ణంగా ఉంది. కొంచెం సేపు తర్వాత మళ్ళీ ప్రయత్నించండి.",
    riskUnavailable:     "ప్రమాద విశ్లేషణ ప్రస్తుతం అందుబాటులో లేదు. డేటా లోడ్ అయినప్పుడు వాతావరణ ప్రశ్నలు అడగవచ్చు.",
    forecastUnavailable: "అభ్యర్థించిన కాలానికి సూచన అందుబాటులో లేదు. {timing}{fresh}",
    riskIncomplete:      "ప్రమాద విశ్లేషణకు అవసరమైన వాతావరణ సమాచారం లేదు. కొంచెం సేపు తర్వాత మళ్ళీ ప్రయత్నించండి.",
    riskApiError:        "ప్రమాద విశ్లేషణ ప్రస్తుతం అందుబాటులో లేదు. డేటా లోడ్ అయినప్పుడు వాతావరణ ప్రశ్నలు అడగవచ్చు.",
    weather:             "{loc}లో ప్రస్తుత వాతావరణం: {temp}\u00b0C ఉష్ణోగ్రత, {hum}% తేమ, {wind} km/h గాలి వేగం, {rain} mm వర్షం. {timing}{fresh}",
    temperature:         "{loc}లో ప్రస్తుత ఉష్ణోగ్రత {temp}\u00b0C. {timing}{fresh}",
    wind:                "{loc}లో ప్రస్తుత గాలి వేగం {wind} km/h. {timing}{fresh}",
    humidity:            "{loc}లో ప్రస్తుత తేమ {hum}%. {timing}{fresh}",
    rainYes:             "అవును, {loc}లో ఇప్పుడు వర్షం పడుతోంది. ప్రస్తుత వర్షపాతం {rain} mm. {timing}{fresh}",
    rainNo:              "{loc}లో ఇప్పుడు వర్షం లేదు. ప్రస్తుత వర్షపాతం {rain} mm మరియు వర్షం సంభావ్యత {prob}%. {timing}{fresh}",
    rainNoProb:          "ప్రస్తుత వర్షపాతం {rain} mm, కానీ వర్షం సంభావ్యత డేటా అందుబాటులో లేదు. {timing}{fresh}",
    forecastToday:       "ఈరోజు తర్వాత, {hours} గంటల సూచనలో {maxProb}% వరకు వర్షం సంభావ్యత మరియు {totalRain} mm వర్షం అంచనా. {timing}{fresh}",
    forecastTomorrow:    "రేపు, {hours} గంటల సూచనలో {maxProb}% వరకు వర్షం సంభావ్యత మరియు {totalRain} mm వర్షం అంచనా. {timing}{fresh}",
    risk:                "{loc}లో ప్రస్తుత ప్రమాదం: {riskLevel} ({riskScore}/100). Confidence: {confidence}%. సలహా: {advice} {timing}{fresh}",
    historyLoading:      "SKYRA ప్రస్తుత పరిస్థితులకు చారిత్రక నమూనా విశ్లేషణ చేస్తోంది...",
    history:             "{loc} చారిత్రక నమూనా నిఘా \u2014 నమూనా సారూప్యత: {patternMatch}% ({similarityLevel}). సారూప్య చారిత్రక సంఘటనలు: {similarEventCount}. చారిత్రక ప్రమాదం: {historicalRisk}. అత్యంత సాధారణ ప్రభావం: {commonImpact} ({impactLikelihood}% సారూప్య సంఘటనలలో).{trendLine} {explanation} \u2014 డేటా: {dataCoverage}.",
    historyLowData:      "చారిత్రక విశ్లేషణలో {similarEventCount} సారూప్య సంఘటన(లు) మాత్రమే కనుగొనబడ్డాయి. నమూనా సారూప్యత: {patternMatch}%. సాధారణ ప్రభావం: {commonImpact}.",
    historyNoData:       "ప్రస్తుత పరిస్థితులను చారిత్రక రికార్డులతో పోల్చడం సాధ్యపడలేదు. లైవ్ వాతావరణ డేటా అందుబాటులో ఉందో తనిఖీ చేయండి.",
    unsupported:         "వాతావరణం, వర్షం, సూచన, ఉష్ణోగ్రత, గాలి, తేమ, SKYRA ప్రమాదం మరియు చారిత్రక నమూనా విశ్లేషణలో సహాయం చేయగలను.",
    riskAdvice: {
      Severe:   "అప్రమత్తంగా ఉండండి, అధికారిక వాతావరణ మరియు విపత్తు సూచనలను అనుసరించండి.",
      High:     "జాగ్రత్తలు తీసుకోండి, అనవసర ప్రయాణాలు మానుకోండి, అధికారిక హెచ్చరికలను పర్యవేక్షించండి.",
      Moderate: "మారుతున్న పరిస్థితులను గమనించండి, అధికారిక సూచనలను అనుసరించండి.",
      Low:      "SKYRA ప్రకారం ఇప్పుడు పెద్ద వాతావరణ ప్రమాదం లేదు.",
    },
  },

  "kn-IN": {
    greeting:            "ನಮಸ್ಕಾರ! ನಾನು SKYRA. ಹವಾಮಾನ, ಮಳೆ, ತೇವಾಂಶ, ಗಾಳಿ, ಮುನ್ಸೂಚನೆ ಅಥವಾ ವಿಪತ್ತು ಅಪಾಯದ ಬಗ್ಗೆ ನನ್ನನ್ನು ಕೇಳಿ.",
    listening:           "ಕನ್ನಡದಲ್ಲಿ ಕೇಳುತ್ತಿದ್ದೇನೆ... ನಿಮ್ಮ ಹವಾಮಾನ ಅಥವಾ ಸುರಕ್ಷತೆ ಪ್ರಶ್ನೆ ಹೇಳಿ.",
    heardQ:              "ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಕೇಳಿದೆ. ಸಿದ್ಧವಾದಾಗ Send ಒತ್ತಿ.",
    weatherLoading:      "SKYRA ಇತ್ತೀಚಿನ ಮಾಹಿತಿ ಪರಿಶೀಲಿಸುತ್ತಿದೆ...",
    riskLoading:         "SKYRA ಪ್ರಸ್ತುತ ಹವಾಮಾನ ಅಪಾಯ ವಿಶ್ಲೇಷಿಸುತ್ತಿದೆ...",
    weatherUnavailable:  "ಲೈವ್ ಹವಾಮಾನ ಡೇಟಾ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    weatherIncomplete:   "ಲೈವ್ ಹವಾಮಾನ ಡೇಟಾ ಈಗ ಅಪೂರ್ಣವಾಗಿದೆ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    riskUnavailable:     "ಅಪಾಯ ವಿಶ್ಲೇಷಣೆ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಡೇಟಾ ಲೋಡ್ ಆದಾಗ ಹವಾಮಾನ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಬಹುದು.",
    forecastUnavailable: "ಆ ಅವಧಿಗೆ ಮುನ್ಸೂಚನೆ ಲಭ್ಯವಿಲ್ಲ. {timing}{fresh}",
    riskIncomplete:      "ಅಪಾಯ ವಿಶ್ಲೇಷಣೆಗೆ ಅಗತ್ಯ ಹವಾಮಾನ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    riskApiError:        "ಅಪಾಯ ವಿಶ್ಲೇಷಣೆ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಡೇಟಾ ಲೋಡ್ ಆದಾಗ ಹವಾಮಾನ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಬಹುದು.",
    weather:             "{loc}ನಲ್ಲಿ ಪ್ರಸ್ತುತ ಹವಾಮಾನ: {temp}\u00b0C ತಾಪಮಾನ, {hum}% ತೇವಾಂಶ, {wind} km/h ಗಾಳಿ ವೇಗ, {rain} mm ಮಳೆ. {timing}{fresh}",
    temperature:         "{loc}ನಲ್ಲಿ ಪ್ರಸ್ತುತ ತಾಪಮಾನ {temp}\u00b0C. {timing}{fresh}",
    wind:                "{loc}ನಲ್ಲಿ ಪ್ರಸ್ತುತ ಗಾಳಿ ವೇಗ {wind} km/h. {timing}{fresh}",
    humidity:            "{loc}ನಲ್ಲಿ ಪ್ರಸ್ತುತ ತೇವಾಂಶ {hum}%. {timing}{fresh}",
    rainYes:             "ಹೌದು, {loc}ನಲ್ಲಿ ಈಗ ಮಳೆ ಬೀಳುತ್ತಿದೆ. ಪ್ರಸ್ತುತ ಮಳೆ {rain} mm. {timing}{fresh}",
    rainNo:              "{loc}ನಲ್ಲಿ ಈಗ ಮಳೆ ಇಲ್ಲ. ಪ್ರಸ್ತುತ ಮಳೆ {rain} mm ಮತ್ತು ಮಳೆ ಸಂಭಾವ್ಯತೆ {prob}%. {timing}{fresh}",
    rainNoProb:          "ಪ್ರಸ್ತುತ ಮಳೆ {rain} mm, ಆದರೆ ಮಳೆ ಸಂಭಾವ್ಯತೆ ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ. {timing}{fresh}",
    forecastToday:       "ಇಂದು ನಂತರ, {hours} ಗಂಟೆ ಮುನ್ಸೂಚನೆಯಲ್ಲಿ {maxProb}% ವರೆಗೆ ಮಳೆ ಸಂಭಾವ್ಯತೆ ಮತ್ತು {totalRain} mm ನಿರೀಕ್ಷಿತ ಮಳೆ. {timing}{fresh}",
    forecastTomorrow:    "ನಾಳೆ, {hours} ಗಂಟೆ ಮುನ್ಸೂಚನೆಯಲ್ಲಿ {maxProb}% ವರೆಗೆ ಮಳೆ ಸಂಭಾವ್ಯತೆ ಮತ್ತು {totalRain} mm ನಿರೀಕ್ಷಿತ ಮಳೆ. {timing}{fresh}",
    risk:                "{loc}ನಲ್ಲಿ ಪ್ರಸ್ತುತ ಅಪಾಯ: {riskLevel} ({riskScore}/100). Confidence: {confidence}%. ಸಲಹೆ: {advice} {timing}{fresh}",
    historyLoading:      "SKYRA ಪ್ರಸ್ತುತ ಪರಿಸ್ಥಿತಿಗಳಿಗೆ ಐತಿಹಾಸಿಕ ಮಾದರಿ ವಿಶ್ಲೇಷಣೆ ಮಾಡುತ್ತಿದೆ...",
    history:             "{loc} ಐತಿಹಾಸಿಕ ಮಾದರಿ ಬುದ್ಧಿಮತ್ತೆ \u2014 ಮಾದರಿ ಹೊಂದಾಣಿಕೆ: {patternMatch}% ({similarityLevel}). ಸಮಾನ ಐತಿಹಾಸಿಕ ಘಟನೆಗಳು: {similarEventCount}. ಐತಿಹಾಸಿಕ ಅಪಾಯ: {historicalRisk}. ಸಾಮಾನ್ಯ ಪರಿಣಾಮ: {commonImpact} ({impactLikelihood}% ಸಮಾನ ಘಟನೆಗಳಲ್ಲಿ).{trendLine} {explanation} \u2014 ಡೇಟಾ: {dataCoverage}.",
    historyLowData:      "ಐತಿಹಾಸಿಕ ವಿಶ್ಲೇಷಣೆಯಲ್ಲಿ ಕೇವಲ {similarEventCount} ಹೊಂದಾಣಿಕೆಯ ಘಟನೆ(ಗಳು) ಕಂಡುಬಂದಿವೆ. ಮಾದರಿ ಹೊಂದಾಣಿಕೆ: {patternMatch}%. ಸಾಮಾನ್ಯ ಪರಿಣಾಮ: {commonImpact}.",
    historyNoData:       "ಪ್ರಸ್ತುತ ಪರಿಸ್ಥಿತಿಗಳನ್ನು ಐತಿಹಾಸಿಕ ದಾಖಲೆಗಳೊಂದಿಗೆ ಹೋಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಲೈವ್ ಹವಾಮಾನ ಡೇಟಾ ಲಭ್ಯವಿದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.",
    unsupported:         "ಹವಾಮಾನ, ಮಳೆ, ಮುನ್ಸೂಚನೆ, ತಾಪಮಾನ, ಗಾಳಿ, ತೇವಾಂಶ, SKYRA ಅಪಾಯ ಮತ್ತು ಐತಿಹಾಸಿಕ ಮಾದರಿ ವಿಶ್ಲೇಷಣೆಯಲ್ಲಿ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ.",
    riskAdvice: {
      Severe:   "ಎಚ್ಚರವಾಗಿರಿ, ಅಧಿಕೃತ ಹವಾಮಾನ ಮತ್ತು ವಿಪತ್ತು ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ.",
      High:     "ಮುನ್ನೆಚ್ಚರಿಕೆ ತೆಗೆಕೊಳ್ಳಿ, ಅನಗತ್ಯ ಪ್ರಯಾಣ ತಪ್ಪಿಸಿ, ಅಧಿಕೃತ ಎಚ್ಚರಿಕೆಗಳನ್ನು ಗಮನಿಸಿ.",
      Moderate: "ಬದಲಾಗುತ್ತಿರುವ ಪರಿಸ್ಥಿತಿಗಳನ್ನು ಗಮನಿಸಿ, ಅಧಿಕೃತ ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ.",
      Low:      "SKYRA ಪ್ರಕಾರ ಈಗ ದೊಡ್ಡ ಹವಾಮಾನ ಅಪಾಯ ಇಲ್ಲ.",
    },
  },
};

// ─── Template filler ──────────────────────────────────────────────────────────
// Replaces {key} placeholders in a locale template with real values.
function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [key, val]) => text.split(`{${key}}`).join(String(val ?? "")),
    template
  );
}

// ─── Multilingual keyword → English intent mapping ────────────────────────────
const MULTILINGUAL_KEYWORD_MAP = [
  // ── Hindi ──────────────────────────────────────────────────────────────────
  { from: "मौसम",           to: "weather"     },
  { from: "बारिश",         to: "rain"        },
  { from: "वर्षा",         to: "rainfall"    },
  { from: "तापमान",        to: "temperature" },
  { from: "हवा",           to: "wind"        },
  { from: "नमी",           to: "humidity"    },
  { from: "आर्द्रता",      to: "humidity"    },
  { from: "कल",            to: "tomorrow"    },
  { from: "भविष्य",        to: "forecast"    },
  { from: "पूर्वानुमान",   to: "forecast"    },
  { from: "खतरा",          to: "risk"        },
  { from: "आपदा",          to: "disaster"    },
  { from: "सुरक्षित",      to: "safe"        },
  { from: "यात्रा",        to: "travel"      },
  { from: "सावधानी",       to: "precaution"  },
  { from: "सतर्क",         to: "cautious"    },
  { from: "इतिहास",        to: "history"     },
  { from: "पुराना",        to: "history"     },
  { from: "ऐतिहासिक",      to: "history"     },
  { from: "पहले",          to: "history"     },
  { from: "पैटर्न",        to: "history"     },
  // ── Malayalam ──────────────────────────────────────────────────────────────
  { from: "കാലാവസ്ഥ",      to: "weather"     },
  { from: "മഴ",            to: "rain"        },
  { from: "താപനില",        to: "temperature" },
  { from: "കാറ്റ്",        to: "wind"        },
  { from: "ആർദ്രത",        to: "humidity"    },
  { from: "നാളെ",          to: "tomorrow"    },
  { from: "പ്രവചനം",       to: "forecast"    },
  { from: "അപകടം",         to: "risk"        },
  { from: "ദുരന്തം",       to: "disaster"    },
  { from: "സുരക്ഷിതം",     to: "safe"        },
  { from: "സുരക്ഷിതമാണോ",  to: "safe"        },
  { from: "യാത്ര",         to: "travel"      },
  { from: "മുൻകരുതൽ",      to: "precaution"  },
  { from: "ചരിത്രം",       to: "history"     },
  { from: "മുമ്പ്",        to: "history"     },
  { from: "ഇതിന് മുൻപ്",   to: "history"     },
  { from: "പ്രതിരൂപം",     to: "history"     },
  // ── Tamil ──────────────────────────────────────────────────────────────────
  { from: "வானிலை",        to: "weather"     },
  { from: "மழை",           to: "rain"        },
  { from: "வெப்பநிலை",     to: "temperature" },
  { from: "காற்று",        to: "wind"        },
  { from: "ஈரப்பதம்",      to: "humidity"    },
  { from: "நாளை",          to: "tomorrow"    },
  { from: "முன்னறிவிப்பு", to: "forecast"    },
  { from: "ஆபத்து",        to: "risk"        },
  { from: "பேரிடர்",       to: "disaster"    },
  { from: "பாதுகாப்பானதா", to: "safe"        },
  { from: "பாதுகாப்பு",    to: "safe"        },
  { from: "பயணம்",         to: "travel"      },
  { from: "முன்னெச்சரிக்கை", to: "precaution" },
  { from: "வரலாறு",        to: "history"     },
  { from: "கடந்த காலம்",   to: "history"     },
  { from: "முன்பு",        to: "history"     },
  { from: "முறை",          to: "history"     },
  // ── Telugu ─────────────────────────────────────────────────────────────────
  { from: "వాతావరణం",      to: "weather"     },
  { from: "వర్షం",         to: "rain"        },
  { from: "ఉష్ణోగ్రత",    to: "temperature" },
  { from: "గాలి",          to: "wind"        },
  { from: "తేమ",           to: "humidity"    },
  { from: "రేపు",          to: "tomorrow"    },
  { from: "సూచన",          to: "forecast"    },
  { from: "ప్రమాదం",       to: "risk"        },
  { from: "విపత్తు",       to: "disaster"    },
  { from: "సురక్షితమేనా",  to: "safe"        },
  { from: "సురక్షితం",     to: "safe"        },
  { from: "ప్రయాణం",       to: "travel"      },
  { from: "జాగ్రత్తలు",   to: "precaution"  },
  { from: "చరిత్ర",        to: "history"     },
  { from: "గతంలో",         to: "history"     },
  { from: "పూర్వం",        to: "history"     },
  { from: "నమూనా",         to: "history"     },
  // ── Kannada ────────────────────────────────────────────────────────────────
  { from: "ಹವಾಮಾನ",        to: "weather"     },
  { from: "ಮಳೆ",           to: "rain"        },
  { from: "ತಾಪಮಾನ",        to: "temperature" },
  { from: "ಗಾಳಿ",          to: "wind"        },
  { from: "ತೇವಾಂಶ",        to: "humidity"    },
  { from: "ನಾಳೆ",          to: "tomorrow"    },
  { from: "ಮುನ್ಸೂಚನೆ",     to: "forecast"    },
  { from: "ಅಪಾಯ",          to: "risk"        },
  { from: "ವಿಪತ್ತು",       to: "disaster"    },
  { from: "ಸುರಕ್ಷಿತವೇ",    to: "safe"        },
  { from: "ಸುರಕ್ಷಿತ",      to: "safe"        },
  { from: "ಪ್ರಯಾಣ",        to: "travel"      },
  { from: "ಮುನ್ನೆಚ್ಚರಿಕೆ",  to: "precaution"  },
  { from: "ಇತಿಹಾಸ",        to: "history"     },
  { from: "ಹಿಂದೆ",         to: "history"     },
  { from: "ಮಾದರಿ",         to: "history"     },
];

// ─── English typo corrections ─────────────────────────────────────────────────
const TYPO_CORRECTIONS = {
  rane: "rain",
  tomorow: "tomorrow",
  temprature: "temperature",
  humdity: "humidity",
  windd: "wind",
  forcast: "forecast",
  dissaster: "disaster",
  travell: "travel",
  precautons: "precautions",
};

const INTENT_VOCABULARY = [
  "rain", "rainfall", "raining", "precipitation",
  "forecast", "later", "next", "tomorrow", "expected",
  "temperature", "wind", "windy", "humidity", "humid",
  "weather", "conditions", "today",
  "risk", "danger", "disaster", "safe", "cautious",
  "precaution", "precautions",
  "history", "historical", "pattern", "patterns", "before", "similar", "past",
];

// ─── Levenshtein helpers ──────────────────────────────────────────────────────
function getEditDistance(first, second) {
  const row = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let previousDiagonal = row[0];
    row[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const previousRowValue = row[secondIndex];
      const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      row[secondIndex] = Math.min(
        row[secondIndex] + 1,
        row[secondIndex - 1] + 1,
        previousDiagonal + substitutionCost
      );
      previousDiagonal = previousRowValue;
    }
  }
  return row[second.length];
}

function getMaximumTypoDistance(word) {
  if (word.length >= 9) return 3;
  if (word.length >= 6) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

function correctIntentWord(word) {
  if (TYPO_CORRECTIONS[word] || INTENT_VOCABULARY.includes(word)) {
    return TYPO_CORRECTIONS[word] || word;
  }
  const maximumDistance = getMaximumTypoDistance(word);
  if (maximumDistance === 0) return word;
  const closeMatches = INTENT_VOCABULARY
    .map((candidate) => ({ candidate, distance: getEditDistance(word, candidate) }))
    .filter(({ distance }) => distance <= maximumDistance);
  if (closeMatches.length === 0) return word;
  const closestDistance = Math.min(...closeMatches.map(({ distance }) => distance));
  const closestMatches = closeMatches.filter(({ distance }) => distance === closestDistance);
  return closestMatches.length === 1 ? closestMatches[0].candidate : word;
}

// ─── Multilingual pre-processing ─────────────────────────────────────────────
function translateToEnglishIntentTokens(text) {
  let result = text;
  for (const { from, to } of MULTILINGUAL_KEYWORD_MAP) {
    result = result.split(from).join(to);
  }
  return result;
}

function normalizeQuestion(question) {
  const translated = translateToEnglishIntentTokens(question);
  return translated
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(correctIntentWord)
    .join(" ");
}

function getIntent(question) {
  const text = normalizeQuestion(question);
  if (/\b(history|historical|pattern|patterns|before|similar|past)\b/.test(text)) return "history";
  if (/\b(risk|danger|disaster|safe|cautious|precaution|precautions)\b|what should i do/.test(text)) return "risk";
  if (/\b(forecast|later|next|tomorrow|expected)\b/.test(text)) return "forecast";
  if (/\b(rain|rainfall|raining|precipitation)\b/.test(text)) return "rain";
  if (/\b(temperature|hot|cold)\b/.test(text)) return "temperature";
  if (/\b(wind|windy)\b/.test(text)) return "wind";
  if (/\b(humidity|humid)\b/.test(text)) return "humidity";
  if (/\b(weather|conditions|today)\b/.test(text)) return "weather";
  return "unsupported";
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
function hasValue(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function getForecastSummary(weather, question) {
  const { current = {}, hourly = {} } = weather;
  const currentTime = current.time;
  const currentDate = currentTime?.slice(0, 10);
  const isTomorrow = normalizeQuestion(question).includes("tomorrow");
  const entries = (hourly.time || []).map((time, index) => ({
    time,
    probability: hourly.precipitation_probability?.[index],
    precipitation: hourly.precipitation?.[index],
  })).filter((entry) => hasValue(entry.probability) && hasValue(entry.precipitation) && (
    isTomorrow
      ? entry.time.slice(0, 10) > currentDate
      : entry.time > currentTime && entry.time.slice(0, 10) === currentDate
  ));
  if (entries.length === 0) return null;
  return {
    isTomorrow,
    hours: entries.length,
    highestProbability: Math.max(...entries.map((entry) => Number(entry.probability))),
    expectedRainfall: entries.reduce((total, entry) => total + Number(entry.precipitation), 0),
  };
}

// ─── Locale-aware response builder ───────────────────────────────────────────
// Returns a localized string for the given templateKey, substituting real values.
function buildResponse(lang, templateKey, values = {}) {
  const locale = RESPONSES[lang] ?? RESPONSES["en-IN"];
  const template = locale[templateKey] ?? RESPONSES["en-IN"][templateKey] ?? "";
  return fillTemplate(template, values);
}

// Returns the localized risk advice string for a given riskLevel.
function getLocalizedRiskAdvice(lang, riskLevel) {
  const locale = RESPONSES[lang] ?? RESPONSES["en-IN"];
  return (
    locale.riskAdvice?.[riskLevel] ??
    RESPONSES["en-IN"].riskAdvice[riskLevel] ??
    RESPONSES["en-IN"].riskAdvice.Low
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
function WeatherGPT({ onNavigate, activePage, currentLocation, savedLocation }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(() => RESPONSES["en-IN"].greeting);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState("en-IN");
  const [isSpeaking, setIsSpeaking] = useState(false);
  // activeLocation holds the resolved GPS location (or DEMO fallback).
  // isFallbackLocation is true when the user's live GPS could not be obtained.
  const [activeLocation, setActiveLocation] = useState(DEMO_FALLBACK_LOCATION);
  const [isFallbackLocation, setIsFallbackLocation] = useState(true);
  // activeLocationRef mirrors activeLocation state so refreshWeather() always
  // reads the latest coordinates without stale-closure issues.
  const activeLocationRef = useRef(DEMO_FALLBACK_LOCATION);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);

  // Update greeting when language changes (only when idle)
  function handleLangChange(newCode) {
    setVoiceLang(newCode);
    if (!asking && !listening) {
      setAnswer(RESPONSES[newCode]?.greeting ?? RESPONSES["en-IN"].greeting);
    }
  }

  // ── Derive a clean display name from the active location ────────────────
  function getLocationName() {
    if (isFallbackLocation) return BHUBANESWAR.name;            // "Bhubaneswar"
    return activeLocation.city ?? activeLocation.displayName ?? "Your location";
  }

  async function refreshWeather() {
    // Always read from the ref so we get the latest resolved coordinates
    // regardless of when this function was closed over during rendering.
    const loc = activeLocationRef.current;
    const data = await getLiveWeather(loc.latitude, loc.longitude);
    setWeather(data);
    return data;
  }

  // ── Resolve user location, then load weather ────────────────────────────
  // Called once on mount. Uses getCurrentLocationOrFallback() which never
  // rejects — it returns DEMO_FALLBACK_LOCATION on any permission/GPS error.
  useEffect(() => {
    async function initLocationAndWeather() {
      try {
        // Step 1: request GPS (one-shot, explicit user consent)
        const loc = await getCurrentLocationOrFallback();
        // Update both the ref (read by refreshWeather) and the state (drives UI).
        activeLocationRef.current = loc;
        setActiveLocation(loc);
        const isDemo = loc.source === "demo_fallback";
        setIsFallbackLocation(isDemo);

        // Step 2: fetch weather for the resolved coordinates
        const data = await getLiveWeather(loc.latitude, loc.longitude);
        setWeather(data);

        // Show a subtle notice if we fell back to demo location
        if (isDemo) {
          setAnswer(
            "Using DEMO location (Bhubaneswar). " +
            "Allow location access to get weather for your actual position. " +
            "You can still ask any question."
          );
        }
      } catch (error) {
        // getLiveWeather failure (network) — location was resolved, weather failed
        console.error("WeatherGPT init error:", error);
        setAnswer(buildResponse("en-IN", "weatherUnavailable"));
      } finally {
        setLoading(false);
      }
    }
    initLocationAndWeather();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
    recognitionRef.current = null;

    // Also cleanup speech synthesis
    const synth = window.speechSynthesis;
    if (synth) {
      try {
        synth.cancel();
      } catch (error) {
        console.error("SKYRA cleanup error:", error);
      }
    }
    speechSynthesisRef.current = null;
  }, []);

  // ── Voice input handler ──────────────────────────────────────────────────
  function handleVoiceInput() {
    if (listening) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setAnswer("Voice input is not supported in this browser. Please type your question instead.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = voiceLang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setQuestion(transcript);
        setAnswer(buildResponse(voiceLang, "heardQ"));
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setAnswer("Microphone permission was not granted. You can type your question instead.");
      } else {
        setAnswer("Voice input could not be completed. You can type your question instead.");
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setListening(false);
    };

    try {
      setListening(true);
      setAnswer(buildResponse(voiceLang, "listening"));
      recognition.start();
    } catch (error) {
      console.error("SKYRA voice input error:", error);
      recognitionRef.current = null;
      setListening(false);
      setAnswer("Voice input could not be started. You can type your question instead.");
    }
  }

  // ── Voice output handler (text-to-speech) ────────────────────────────────
  function handleSpeak() {
    // Stop any ongoing speech first to prevent overlapping
    if (isSpeaking) {
      handleStop();
      return;
    }

    const synth = window.speechSynthesis;
    if (!synth) {
      console.warn("SKYRA voice output: speechSynthesis not supported in this browser");
      return;
    }

    // Cancel any previous utterances
    synth.cancel();

    const textToSpeak = answer.trim();
    if (!textToSpeak) return;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Map SKYRA language codes to Web Speech API language tags
    const langMap = {
      "en-IN": "en-IN",
      "hi-IN": "hi-IN",
      "ml-IN": "ml-IN",
      "ta-IN": "ta-IN",
      "te-IN": "te-IN",
      "kn-IN": "kn-IN",
    };

    utterance.lang = langMap[voiceLang] || "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Track speech state
    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      speechSynthesisRef.current = null;
    };

    utterance.onerror = (event) => {
      console.warn("SKYRA voice output error:", event.error);
      setIsSpeaking(false);
      speechSynthesisRef.current = null;

      // Graceful degradation: if the requested voice is unavailable, try with default
      if (event.error === "not-supported" || event.error === "network" || event.error === "synthesis-unavailable") {
        console.warn(`Voice language ${voiceLang} unavailable, retrying with default voice`);
        synth.cancel();
        const fallbackUtterance = new SpeechSynthesisUtterance(textToSpeak);
        fallbackUtterance.lang = "en-IN";
        fallbackUtterance.onstart = () => setIsSpeaking(true);
        fallbackUtterance.onend = () => {
          setIsSpeaking(false);
          speechSynthesisRef.current = null;
        };
        try {
          synth.speak(fallbackUtterance);
          speechSynthesisRef.current = fallbackUtterance;
        } catch (err) {
          console.error("SKYRA fallback voice output failed:", err);
        }
      }
    };

    try {
      synth.speak(utterance);
      speechSynthesisRef.current = utterance;
    } catch (error) {
      console.error("SKYRA voice output error:", error);
      setIsSpeaking(false);
    }
  }

  function handleStop() {
    const synth = window.speechSynthesis;
    if (!synth) return;

    try {
      synth.cancel();
      setIsSpeaking(false);
      speechSynthesisRef.current = null;
    } catch (error) {
      console.error("SKYRA voice output stop error:", error);
      setIsSpeaking(false);
    }
  }

  // ── Ask / Send handler ───────────────────────────────────────────────────
  async function handleAsk() {
    const submittedQuestion = question.trim();
    if (!submittedQuestion || asking) return;

    const lang = voiceLang;
    setAsking(true);
    setAnswer(buildResponse(lang, "weatherLoading"));
    const startedAt = performance.now();
    let weatherData = weather;
    let usingCachedWeather = false;

    try {
      try {
        weatherData = await refreshWeather();
      } catch (error) {
        console.error("WeatherGPT weather refresh error:", error);
        usingCachedWeather = Boolean(weatherData);
        if (!weatherData) {
          setAnswer(buildResponse(lang, "weatherUnavailable"));
          return;
        }
      }

      const { current = {}, hourly = {} } = weatherData;
      const temperature = Number(current.temperature_2m);
      const humidity = Number(current.relative_humidity_2m);
      const wind = Number(current.wind_speed_10m);
      const rainfall = Number(current.rain);
      const normalizedQuestion = normalizeQuestion(submittedQuestion);
      const intent = getIntent(normalizedQuestion);
      const timing = `Analyzed in ${formatDuration(performance.now() - startedAt)}.`;
      const fresh = usingCachedWeather
        ? " Live refresh was unavailable, so this uses the last loaded weather data."
        : "";

      // Common value bag shared by most templates
      const base = {
        loc: getLocationName(),
        temp: Math.round(temperature),
        hum: Math.round(humidity),
        wind: Math.round(wind),
        rain: rainfall,
        timing,
        fresh,
      };

      if (intent === "history") {
        // Requires all four live weather values; month is derived from system clock.
        if (![temperature, humidity, wind, rainfall].every(Number.isFinite)) {
          setAnswer(buildResponse(lang, "historyNoData"));
          return;
        }
        setAnswer(buildResponse(lang, "historyLoading"));
        const currentMonth = new Date().getMonth() + 1; // 1–12
        const loc = activeLocationRef.current;
        const histResult = await analyzeHistoricalPatterns({
          rainfall,
          humidity,
          temperature,
          wind,
          month: currentMonth,
          location: getLocationName(),
          latitude: loc.latitude,
          longitude: loc.longitude,
        });

        if (histResult.status === "insufficient_data") {
          setAnswer(buildResponse(lang, "historyNoData"));
          return;
        }

        const trendLine = histResult.historicalTrend
          ? ` Trend: ${histResult.historicalTrend}.`
          : "";

        const templateKey =
          histResult.status === "low_data" ? "historyLowData" : "history";

        setAnswer(buildResponse(lang, templateKey, {
          loc:              histResult.location,
          patternMatch:     histResult.patternMatch,
          similarityLevel:  histResult.similarityLevel,
          similarEventCount: histResult.similarEventCount,
          historicalRisk:   histResult.historicalRisk,
          commonImpact:     histResult.commonImpact,
          impactLikelihood: histResult.impactLikelihood,
          trendLine,
          explanation:      histResult.explanation,
          dataCoverage:     histResult.dataCoverage,
          dataSource:       histResult.dataSource,
          timing,
          fresh,
        }));

      } else if (intent === "risk") {
        const forecastRainfall = Number(hourly.precipitation?.[0]);
        if (![temperature, humidity, wind, rainfall, Number(current.surface_pressure), forecastRainfall].every(Number.isFinite)) {
          setAnswer(buildResponse(lang, "riskIncomplete"));
          return;
        }

        setAnswer(buildResponse(lang, "riskLoading"));
        const riskResponse = await fetch("http://localhost:5000/api/risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rainfall,
            forecastRainfall,
            humidity,
            windSpeed: wind,
            terrainSlope: 15,
            historicalRisk: 70,
            temperature,
            pressure: Number(current.surface_pressure),
            location: getLocationName(),
          }),
        });
        if (!riskResponse.ok) throw new Error("Risk API request failed");

        const riskData = await riskResponse.json();
        if (!riskData.riskLevel || !hasValue(riskData.riskScore) || !hasValue(riskData.confidence)) {
          throw new Error("Risk API returned incomplete data");
        }

        setAnswer(buildResponse(lang, "risk", {
          ...base,
          riskLevel:  riskData.riskLevel,
          riskScore:  riskData.riskScore,
          confidence: riskData.confidence,
          advice:     getLocalizedRiskAdvice(lang, riskData.riskLevel),
        }));

      } else if (intent === "forecast") {
        const forecast = getForecastSummary(weatherData, normalizedQuestion);
        if (!forecast) {
          setAnswer(buildResponse(lang, "forecastUnavailable", { timing, fresh }));
          return;
        }
        const templateKey = forecast.isTomorrow ? "forecastTomorrow" : "forecastToday";
        setAnswer(buildResponse(lang, templateKey, {
          ...base,
          hours:      forecast.hours,
          maxProb:    forecast.highestProbability,
          totalRain:  forecast.expectedRainfall.toFixed(1),
        }));

      } else if (![temperature, humidity, wind, rainfall].every(Number.isFinite)) {
        setAnswer(buildResponse(lang, "weatherIncomplete"));

      } else if (intent === "rain") {
        const probability = hourly.precipitation_probability?.[0];
        if (!hasValue(probability)) {
          setAnswer(buildResponse(lang, "rainNoProb", base));
        } else if (rainfall > 0) {
          setAnswer(buildResponse(lang, "rainYes", base));
        } else {
          setAnswer(buildResponse(lang, "rainNo", { ...base, prob: probability }));
        }

      } else if (intent === "temperature") {
        setAnswer(buildResponse(lang, "temperature", base));
      } else if (intent === "wind") {
        setAnswer(buildResponse(lang, "wind", base));
      } else if (intent === "humidity") {
        setAnswer(buildResponse(lang, "humidity", base));
      } else if (intent === "weather") {
        setAnswer(buildResponse(lang, "weather", base));
      } else {
        setAnswer(buildResponse(lang, "unsupported"));
      }

    } catch (error) {
      console.error("SKYRA risk error:", error);
      setAnswer(buildResponse(lang, "riskApiError"));
    } finally {
      setQuestion("");
      setAsking(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="skyra-page weather-page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        currentLocation={currentLocation}
        savedLocation={savedLocation}
      />
      <div className="page-shell">
        <section className="panel glass-panel chat-panel">
          <div className="panel-header chat-header">
            <div>
              <p className="eyebrow">ASK SKYRA</p>
              <h2>WeatherGPT</h2>
            </div>

            {/* ── Voice language selector + Voice button ───────────────── */}
            <div
              className="voice-controls"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <label
                htmlFor="voice-lang-select"
                style={{ fontSize: "0.75rem", opacity: 0.8, whiteSpace: "nowrap", color: "#e2e8f0" }}
              >
                Language:
              </label>

              {/*
                Task 1 fix — high-contrast selector styling.
                The <select> itself is forced to a dark background with light text
                so it reads clearly on the SKYRA blue/dark interface.
                <option> elements inherit color from the OS native picker, but we
                set explicit background-color / color on them so Chromium-based
                browsers (which do honour these properties) also render them clearly.
              */}
              <select
                id="voice-lang-select"
                value={voiceLang}
                onChange={(e) => handleLangChange(e.target.value)}
                disabled={listening}
                style={{
                  fontSize: "0.8rem",
                  fontWeight: "500",
                  padding: "0.3rem 0.5rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "#1e293b",
                  color: "#f1f5f9",
                  cursor: listening ? "not-allowed" : "pointer",
                  outline: "none",
                  appearance: "auto",          /* keep the native dropdown arrow */
                  WebkitAppearance: "auto",
                  minWidth: "8rem",
                }}
                aria-label="Voice input language"
              >
                {VOICE_LANGUAGES.map((lang) => (
                  <option
                    key={lang.code}
                    value={lang.code}
                    style={{ background: "#1e293b", color: "#f1f5f9" }}
                  >
                    {lang.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="mini-action"
                onClick={handleVoiceInput}
                disabled={listening}
                aria-pressed={listening}
              >
                {listening ? "🎤 Listening..." : "🎤 Voice"}
              </button>
            </div>
          </div>

          <div className="chat-thread">
            <div className="message skyra-message">
              <span>SKYRA</span>
              <p>{answer}</p>
              {/* Voice output controls */}
              <div
                className="voice-output-controls"
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "1rem",
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  className="mini-action"
                  onClick={handleSpeak}
                  disabled={!answer.trim()}
                  aria-label="Speak the answer"
                  title="Read the answer aloud"
                >
                  {isSpeaking ? "🔊 Speaking..." : "🔊 Speak"}
                </button>
                {isSpeaking && (
                  <button
                    type="button"
                    className="mini-action"
                    onClick={handleStop}
                    aria-label="Stop speaking"
                    title="Stop reading"
                    style={{ opacity: 0.8 }}
                  >
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="chat-input-wrap">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows="4"
              placeholder="Ask SKYRA about weather, rain, wind, humidity, forecast, or risk..."
            />
            <div className="chat-actions">
              <button
                type="button"
                className="primary-submit"
                onClick={handleAsk}
                disabled={asking || loading}
              >
                {asking ? "Thinking..." : "Send"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setQuestion("What are the current conditions?")}
              >
                Quick ask
              </button>
            </div>
          </div>

          <div className="suggested-questions">
            <span>Suggested questions</span>
            <div className="chip-list">
              <button type="button" onClick={() => setQuestion("Is it raining right now?")}>Is it raining right now?</button>
              <button type="button" onClick={() => setQuestion("What is the current weather risk?")}>What is the current weather risk?</button>
              <button type="button" onClick={() => setQuestion("Will it rain later today?")}>Will it rain later today?</button>
              <button type="button" onClick={() => setQuestion("How humid is it?")}>How humid is it?</button>
              <button type="button" onClick={() => setQuestion("What happened here before?")}>What happened here before?</button>
              <button type="button" onClick={() => setQuestion("Show historical patterns")}>Show historical patterns</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default WeatherGPT;
