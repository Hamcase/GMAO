import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { data, machine } = await request.json();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is not set on the server.' },
        { status: 503 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No data provided' },
        { status: 400 },
      );
    }

    console.log(`[AMDEC AI] Received ${data.length} records for machine: ${machine || 'all'}`);
    console.log('[AMDEC AI] Sample record:', data[0]);

    // Aggregate failures by component + type
    const aggregated = new Map();
    data.forEach((record: any) => {
      if (!record.component || !record.failureType) {
        console.warn('[AMDEC AI] Skipping record - missing component or failureType:', {
          component: record.component,
          failureType: record.failureType,
          machine: record.machine,
        });
        return;
      }
      const key = `${record.component}|${record.failureType}`;
      const current = aggregated.get(key) || {
        component: record.component,
        failureType: record.failureType,
        count: 0,
        totalCost: 0,
        totalDowntime: 0,
      };
      aggregated.set(key, {
        ...current,
        count: current.count + 1,
        totalCost: current.totalCost + (record.materialCost || 0),
        totalDowntime: current.totalDowntime + (record.downtimeDuration || 0),
      });
    });

    const failures = Array.from(aggregated.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    if (failures.length === 0) {
      console.log('[AMDEC AI] No valid failures found after aggregation');
      return NextResponse.json({ 
        results: [],
        message: 'Aucune défaillance trouvée avec composant et type de panne valides'
      });
    }

    console.log(`[AMDEC AI] Analyzing ${failures.length} failure modes for machine: ${machine || 'all'}`);
    console.log('[AMDEC AI] Input failures:', failures.map(f => `"${f.component}" - "${f.failureType}"`));

    // Build prompt for Groq
    const system = `Tu es un expert en analyse AMDEC (Analyse des Modes de Défaillance, de leurs Effets et de leur Criticité).

RÈGLES STRICTES:
1. Analyse UNIQUEMENT les données fournies - ne jamais inventer de composants ou modes de défaillance
2. Retourne EXACTEMENT le même nombre d'entrées que dans les données fournies
3. Utilise les noms EXACTS des composants et types de panne (pas de traduction, pas de modification)
4. IMPORTANT: Chaque action doit être UNIQUE et SPÉCIFIQUE au composant et contexte. Ne pas répéter les mêmes actions génériques.

Critères de notation (1-5):
- F (Fréquence): 1=<5 occurrences, 2=5-15, 3=15-30, 4=30-50, 5=>50
- G (Gravité): Basée sur coût + temps d'arrêt: 1=faible (<500€ + <10h), 2=modéré (500-1500€ + 10-30h), 3=important (1500-3000€ + 30-60h), 4=grave (3000-5000€ + 60-100h), 5=critique (>5000€ ou >100h)
- D (Détectabilité): 1=évident immédiatement, 2=détectable rapidement, 3=nécessite inspection, 4=difficile, 5=très difficile

ACTION - Règles pour la recommandation:
• Sois SPÉCIFIQUE au composant exact (mentionne le nom du composant dans l'action)
• Adapte selon la criticité (RPN = F×G×D):
  - RPN ≥75: Action immédiate et détaillée (ex: "Remplacer immédiatement [composant] + analyser cause racine + former personnel")
  - RPN 40-74: Action planifiée (ex: "Planifier révision mensuelle de [composant] + améliorer détection précoce")
  - RPN 20-39: Surveillance ciblée (ex: "Surveiller [composant] lors des rondes quotidiennes + documenter signes précurseurs")
  - RPN <20: Monitoring simple (ex: "Enregistrer occurrences [composant] dans carnet de maintenance")
• Varie le type d'action: maintenance préventive, formation, pièces de rechange, révision design, amélioration procédure, etc.
• Maximum 15 mots par action - concis et actionnable

Format de réponse OBLIGATOIRE (JSON array, pas de markdown):
[
  {
    "component": "nom EXACT du composant tel que fourni",
    "failureType": "type EXACT de panne tel que fourni",
    "F": 1-5,
    "G": 1-5,
    "D": 1-5,
    "action": "action CONCISE et SPÉCIFIQUE (max 15 mots)"
  }
]`;

    const user = `Machine: ${machine || 'Toutes machines'}

DONNÉES À ANALYSER (${failures.length} modes de défaillance):

${failures.map((f, idx) => `${idx + 1}. Composant: "${f.component}"
   Type de panne: "${f.failureType}"
   Occurrences: ${f.count}
   Coût total: ${Math.round(f.totalCost)}€
   Temps d'arrêt total: ${Math.round(f.totalDowntime * 10) / 10}h`).join('\n\n')}

IMPORTANT: 
- Analyse ces ${failures.length} modes UNIQUEMENT. Ne pas ajouter d'autres composants.
- Retourne exactement ${failures.length} résultats avec les noms EXACTS ci-dessus.
- Chaque action doit être DIFFÉRENTE et SPÉCIFIQUE - varie les recommandations (maintenance, formation, design, stock, procédure, etc.)
- Maximum 15 mots par action - sois concis et actionnable.`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 3000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    console.log('[AMDEC AI] Groq API status:', resp.status);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[AMDEC AI] Groq error:', resp.status, errText);
      return NextResponse.json(
        { error: `Groq error: ${resp.status}`, detail: errText?.slice(0, 500) },
        { status: resp.status },
      );
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '[]';
    
    console.log('[AMDEC AI] Raw LLM response (first 500 chars):', content.slice(0, 500));

    // Parse JSON response - handle markdown code fences if present
    let analysisResults = [];
    try {
      // Try to extract JSON from markdown code fence
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        analysisResults = JSON.parse(jsonMatch[0]);
      } else {
        analysisResults = JSON.parse(content);
      }
      console.log('[AMDEC AI] Parsed LLM results:', analysisResults.map((r: any) => `"${r.component}" - "${r.failureType}"`));
    } catch (parseError) {
      console.error('[AMDEC AI] JSON parse error:', parseError);
      console.error('[AMDEC AI] Content:', content);
      return NextResponse.json(
        { error: 'Failed to parse AI response', detail: content.slice(0, 500) },
        { status: 500 },
      );
    }

    // Validate: Only return results that match input data (prevent hallucinations)
    console.log(`[AMDEC AI] Validating ${analysisResults.length} results against ${failures.length} input failures`);
    
    // Helper to normalize strings for comparison (remove extra spaces, normalize case)
    const normalize = (str: string) => str.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // TEMPORARY: Log detailed comparison for debugging
    if (analysisResults.length > 0 && failures.length > 0) {
      console.log('[AMDEC AI] First LLM result:', {
        component: analysisResults[0].component,
        failureType: analysisResults[0].failureType,
        normalized_comp: normalize(analysisResults[0].component),
        normalized_fail: normalize(analysisResults[0].failureType),
      });
      console.log('[AMDEC AI] First input failure:', {
        component: failures[0].component,
        failureType: failures[0].failureType,
        normalized_comp: normalize(failures[0].component),
        normalized_fail: normalize(failures[0].failureType),
      });
    }
    
    const validResults = analysisResults.filter((result: any) => {
      const normalizedResultComp = normalize(result.component);
      const normalizedResultFail = normalize(result.failureType);
      
      const matchingFailure = failures.find(f => {
        const normalizedInputComp = normalize(f.component);
        const normalizedInputFail = normalize(f.failureType);
        
        return normalizedInputComp === normalizedResultComp && normalizedInputFail === normalizedResultFail;
      });
      
      if (!matchingFailure) {
        console.warn(`[AMDEC AI] ❌ Filtered: "${result.component}" - "${result.failureType}"`);
        return false;
      }
      console.log(`[AMDEC AI] ✅ Valid match: "${result.component}" - "${result.failureType}"`);
      return true;
    });

    console.log(`[AMDEC AI] After validation: ${validResults.length} valid results`);

    // If LLM missed some, add them with rule-based scoring
    failures.forEach(failure => {
      const normalizedFailComp = normalize(failure.component);
      const normalizedFailType = normalize(failure.failureType);
      
      const exists = validResults.find((r: any) => 
        normalize(r.component) === normalizedFailComp && normalize(r.failureType) === normalizedFailType
      );
      if (!exists) {
        console.warn(`[AMDEC AI] 🔧 Adding missing result: "${failure.component}" - "${failure.failureType}"`);
        // Rule-based fallback for missing items
        const F = failure.count >= 50 ? 5 : failure.count >= 30 ? 4 : failure.count >= 15 ? 3 : failure.count >= 5 ? 2 : 1;
        const impactScore = failure.totalCost / 1000 + failure.totalDowntime * 10;
        const G = impactScore >= 3000 ? 5 : impactScore >= 1500 ? 4 : impactScore >= 500 ? 3 : impactScore >= 100 ? 2 : 1;
        const D = 3;
        
        validResults.push({
          component: failure.component,
          failureType: failure.failureType,
          F,
          G,
          D,
          action: `Surveillance et maintenance préventive sur ${failure.component} pour ${failure.failureType}`
        });
      }
    });

    console.log(`[AMDEC AI] Validated ${validResults.length}/${analysisResults.length} results (filtered ${analysisResults.length - validResults.length} hallucinations)`);

    return NextResponse.json({ results: validResults });
  } catch (error: any) {
    console.error('[AMDEC AI] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
