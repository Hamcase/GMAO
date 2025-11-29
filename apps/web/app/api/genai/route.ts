import { NextResponse } from 'next/server';

type Options = {
  detailedSteps: boolean;
  includeSafety: boolean;
  suggestParts: boolean;
  includeTools: boolean;
  includeRisk: boolean;
  includeResources: boolean;
};

type Solution = {
  title: string;
  summary: string;
  steps: string[];
  safety?: string[];
  parts?: { ref: string; name: string; qty: number }[];
  // NEW: LLM génère ces sections
  tools?: { category: string; refOrType: string; detail: string; value?: string; notes?: string }[];
  risk?: {
    severity: 'Faible' | 'Moyenne' | 'Élevée' | 'Critique';
    probability: 'Rare' | 'Possible' | 'Probable' | 'Fréquente';
    level: 'Faible' | 'Modéré' | 'Important' | 'Critique';
    ppe: string[];
    lotoSteps: string[];
  };
  resources?: { title: string; source: string; url: string }[];
};

export async function POST(req: Request) {
  try {
    const { equipment, priority, description, options, regenerationContext } = (await req.json()) as {
      equipment: string;
      priority: string;
      description: string;
      options: {
        detailedSteps: boolean;
        includeSafety: boolean;
        suggestParts: boolean;
        includeTools: boolean;
        includeRisk: boolean;
        includeResources: boolean;
      };
      regenerationContext?: {
        previousFeedback: string;
        attemptNumber: number;
      };
    };

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is not set on the server.' },
        { status: 503 },
      );
    }

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: 'Description trop courte.' },
        { status: 400 },
      );
    }

    const system = `
You are an industrial maintenance (GMAO) expert. Produce precise, safe, actionable procedures.
Output ONLY valid JSON matching exactly this TypeScript type:
{
  "title": string,
  "summary": string,
  "steps": string[],
  "safety"?: string[],
  "parts"?: { "ref": string, "name": string, "qty": number }[],
  "tools"?: { "category": "Mesure"|"Mécanique"|"Électrique"|"Fluide"|"Référence", "refOrType": string, "detail": string, "value"?: string, "notes"?: string }[],
  "risk"?: {
    "severity": "Faible"|"Moyenne"|"Élevée"|"Critique",
    "probability": "Rare"|"Possible"|"Probable"|"Fréquente",
    "level": "Faible"|"Modéré"|"Important"|"Critique",
    "ppe": string[],
    "lotoSteps": string[]
  },
  "resources"?: { "title": string, "source": string, "url": string }[]
}
No markdown, no code fences, no extra text. Use concise French. If an optional section is not applicable, omit it.
`;

    const user = `
Contexte:
- Équipement: ${equipment || 'Non spécifié'}
- Priorité: ${priority || 'normale'}

Problème:
${description.trim()}

${regenerationContext ? `
⚠️ RÉGÉNÉRATION (Tentative #${regenerationContext.attemptNumber})
La réponse précédente a été refusée. Retour utilisateur:
"${regenerationContext.previousFeedback}"

AJUSTEMENTS REQUIS:
- Si "trop général/vague": Fournir des valeurs numériques précises, références exactes de composants
- Si "manque de détails techniques": Ajouter couples de serrage, tolérances, spécifications électriques
- Si "pas assez de contexte sécurité": Développer davantage les risques et procédures LOTO
- Si "pièces non adaptées": Suggérer des alternatives avec références plus spécifiques
- Adopter une approche différente de la tentative précédente
` : ''}

Options:
- Étapes détaillées: ${options?.detailedSteps ? 'oui' : 'non'}
- Inclure sécurité: ${options?.includeSafety ? 'oui' : 'non'}
- Suggérer pièces: ${options?.suggestParts ? 'oui' : 'non'}
- Inclure outils/specs: ${options?.includeTools ? 'oui' : 'non'}
- Inclure évaluation risques/LOTO: ${options?.includeRisk ? 'oui' : 'non'}
- Inclure ressources documentaires: ${options?.includeResources ? 'oui (retourne 3-5 URLs vers pages d\'accueil de support UNIQUEMENT: https://www.se.com/fr/fr/, https://www.siemens.com/fr/fr/, https://new.abb.com/fr, https://www.osha.gov/. Titre décrit ce que l\'utilisateur doit chercher, ex: "Manuel moteur M12" mais URL pointe vers page d\'accueil support)' : 'non'}

Contraintes:
- Fournir des étapes ordonnées, claires et actionnables.
- Si sécurité incluse: points clés de consignation/EPI/risques.
- Si pièces incluses: 2–6 refs plausibles (ex: roulements, contacteurs), quantités réalistes.
- Si outils inclus: multimètre, clé dynamométrique, manomètre, kit LOTO, huiles/fluides pertinents avec valeurs (couples, pressions, températures).
- Si risques inclus: évaluer gravité, probabilité, niveau (matrice), lister PPE nécessaires et étapes LOTO.
- Si ressources incluses: IMPORTANT - utiliser UNIQUEMENT les URLs de pages d'accueil support: Schneider Electric (https://www.se.com/fr/fr/), Siemens (https://www.siemens.com/fr/fr/), ABB (https://new.abb.com/fr), OSHA (https://www.osha.gov/). Le titre doit décrire le document recherché (ex: "Guide maintenance compresseur Atlas Copco") mais l'URL doit rester la page d'accueil.
`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: regenerationContext ? 0.4 : 0.3, // Slightly higher temp for variety on regenerations
        max_tokens: 2500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    console.log('[GenAI] Request sent to Groq, status:', resp.status);

    if (!resp.ok) {
      const errText = await safeText(resp);
      console.error('[GenAI API] Groq error:', resp.status, errText);
      return NextResponse.json(
        { error: `Groq error: ${resp.status} ${resp.statusText}`, detail: errText?.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    console.log('[GenAI] Raw LLM response length:', content.length);
    console.log('[GenAI] First 300 chars:', content.slice(0, 300));

    let parsed: Solution | null = null;
    
    // Try parsing as direct JSON first
    try {
      parsed = JSON.parse(content);
      console.log('[GenAI] ✅ Parsed as direct JSON');
    } catch (firstErr) {
      console.log('[GenAI] ❌ Direct JSON parse failed, trying markdown extraction...');
      
      // Try extracting from markdown code blocks
      const match = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/i);
      if (match?.[1]) {
        try {
          parsed = JSON.parse(match[1]);
          console.log('[GenAI] ✅ Parsed from markdown block');
        } catch (mdErr) {
          console.log('[GenAI] ❌ Markdown block parse failed');
        }
      }
    }

    // Validate parsed structure
    if (!parsed || !parsed.title || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      console.error('[GenAI] ⚠️ Validation failed:', {
        hasParsed: !!parsed,
        hasTitle: parsed?.title,
        stepsIsArray: Array.isArray(parsed?.steps),
        stepsLength: parsed?.steps?.length
      });
      
      return NextResponse.json(
        { 
          error: 'Invalid response structure from AI',
          detail: 'L\'IA n\'a pas retourné une structure valide. Veuillez reformuler votre demande.',
          rawContent: content.slice(0, 500)
        },
        { status: 422 },
      );
    }

    console.log('[GenAI] ✅ Response validated successfully');
    return NextResponse.json({ solution: parsed }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: String(e?.message || e) },
      { status: 500 },
    );
  }
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return null;
  }
}