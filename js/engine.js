window.Calc = window.Calc || {};

(function (Calc) {
  'use strict';

  // ── Barème IR 2024 ──
  const IR_TRANCHES = [
    { limit: 11294, rate: 0 },
    { limit: 28797, rate: 0.11 },
    { limit: 82341, rate: 0.30 },
    { limit: 177106, rate: 0.41 },
    { limit: Infinity, rate: 0.45 },
  ];

  const ABATTEMENT_RATE = 0.10;
  const ABATTEMENT_MIN = 495;
  const ABATTEMENT_MAX = 14171;

  // Décote 2024
  const DECOTE_SEUIL_SEUL = 1929;
  const DECOTE_SEUIL_COUPLE = 3191;
  const DECOTE_COEFF = 0.4525;

  // ── Charges & taux ──
  const MICRO_URSSAF_BNC = 0.211;    // Prestations de service BNC
  const MICRO_VFL_RATE = 0.022;       // Versement forfaitaire libératoire
  const SASU_CHARGES_RATE = 0.82;     // Coût total pour 1€ net de salaire (~45% charges sur brut)
  const TNS_CHARGES_RATE = 0.45;      // Charges TNS EURL
  const PORTAGE_FRAIS_GESTION = 0.10; // Frais de gestion portage
  const PORTAGE_CHARGES_RATE = 0.50;  // Charges salariales+patronales portage
  const FLAT_TAX = 0.30;
  const IS_SEUIL = 42500;
  const IS_RATE_LOW = 0.15;
  const IS_RATE_HIGH = 0.25;
  const SALARIE_CHARGES_CADRE = 0.25;
  const SALARIE_CHARGES_NON_CADRE = 0.22;
  const CSG_CRDS_RATE = 0.172;       // Prélèvements sociaux sur plus-values
  const DEFAULT_JOURS = 218;

  // ── Utilitaires ──

  function formatEuro(n) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // ── Impôt sur le revenu ──

  function computeIR(revenuNet, parts) {
    parts = parts || 1;

    // Abattement 10%
    let abattement = revenuNet * ABATTEMENT_RATE;
    abattement = Math.max(ABATTEMENT_MIN, Math.min(ABATTEMENT_MAX, abattement));
    const revenuImposable = Math.max(0, revenuNet - abattement);

    // Quotient familial
    const qf = revenuImposable / parts;

    // Calcul par tranche
    let impotQF = 0;
    let prev = 0;
    const tranches = [];
    for (const t of IR_TRANCHES) {
      if (qf <= prev) break;
      const base = Math.min(qf, t.limit) - prev;
      const impotTranche = base * t.rate;
      impotQF += impotTranche;
      tranches.push({
        de: prev,
        a: Math.min(qf, t.limit),
        taux: t.rate,
        montant: round2(impotTranche * parts),
      });
      prev = t.limit;
    }

    let impotBrut = round2(impotQF * parts);

    // Décote
    const seuilDecote = parts > 1 ? DECOTE_SEUIL_COUPLE : DECOTE_SEUIL_SEUL;
    let decote = 0;
    if (impotBrut > 0 && impotBrut < seuilDecote) {
      decote = round2(seuilDecote - DECOTE_COEFF * impotBrut);
      decote = Math.max(0, decote);
    }

    const impotNet = Math.max(0, round2(impotBrut - decote));

    // Taux
    const tauxMoyen = revenuNet > 0 ? round2((impotNet / revenuNet) * 100) : 0;
    const tauxMarginal = tranches.length > 0 ? tranches[tranches.length - 1].taux * 100 : 0;

    return {
      revenuNet,
      abattement: round2(abattement),
      revenuImposable: round2(revenuImposable),
      quotientFamilial: round2(qf),
      impotBrut,
      decote,
      impotNet,
      tranches,
      tauxMoyen,
      tauxMarginal,
    };
  }

  // ── IS (Impôt sur les sociétés) ──

  function computeIS(benefice) {
    if (benefice <= 0) return 0;
    if (benefice <= IS_SEUIL) return round2(benefice * IS_RATE_LOW);
    return round2(IS_SEUIL * IS_RATE_LOW + (benefice - IS_SEUIL) * IS_RATE_HIGH);
  }

  // ── Freelance ──

  function computeFreelance(params) {
    const ca = params.ca || 0;
    const statut = params.statut || 'micro';
    const jours = params.jours || DEFAULT_JOURS;
    const parts = params.parts || 1;
    const vfl = params.vfl || false;
    const splitSalaire = params.splitSalaire != null ? params.splitSalaire / 100 : 0.5;
    const fraisGestion = params.fraisGestion != null ? params.fraisGestion / 100 : PORTAGE_FRAIS_GESTION;

    let result = {
      caBrut: round2(ca),
      statut,
      mensuelBrut: round2(ca / 12),
      tjm: jours > 0 ? round2(ca / jours) : 0,
    };

    if (statut === 'micro') {
      const urssaf = round2(ca * MICRO_URSSAF_BNC);
      const netAvantIR = round2(ca - urssaf);
      let ir, netApresIR;

      if (vfl) {
        ir = round2(ca * MICRO_VFL_RATE);
        netApresIR = round2(netAvantIR - ir);
      } else {
        // Abattement BNC 34% pour le calcul IR micro
        const revenuImposableMicro = round2(ca * 0.66);
        const irResult = computeIR(revenuImposableMicro, parts);
        ir = irResult.impotNet;
        netApresIR = round2(netAvantIR - ir);
      }

      Object.assign(result, {
        charges: urssaf,
        chargesDetail: { 'URSSAF (21.1%)': urssaf },
        netAvantIR,
        ir,
        vfl,
        netApresIR,
        mensuelNet: round2(netApresIR / 12),
        tauxCharges: round2(((ca - netApresIR) / ca) * 100),
      });
    } else if (statut === 'sasu') {
      // Répartition salaire / dividendes
      const partSalaireBrut = round2(ca * splitSalaire);
      const chargesSalaire = round2(partSalaireBrut * (SASU_CHARGES_RATE / (1 + SASU_CHARGES_RATE)));
      const salaireBrut = round2(partSalaireBrut - chargesSalaire);
      const chargesSalariales = round2(salaireBrut * 0.22);
      const salaireNet = round2(salaireBrut - chargesSalariales);

      // Partie dividendes
      const restant = round2(ca - partSalaireBrut);
      const is = computeIS(restant);
      const beneficeDistribuable = round2(restant - is);
      const flatTaxDiv = round2(beneficeDistribuable * FLAT_TAX);
      const dividendesNet = round2(beneficeDistribuable - flatTaxDiv);

      const totalNet = round2(salaireNet + dividendesNet);
      const totalCharges = round2(ca - totalNet);

      // IR sur le salaire net
      const irSalaire = computeIR(salaireNet * 12 / 12 * 12, parts); // annualisé
      // Simplifié: on considère flat tax = libératoire pour dividendes
      const irTotal = irSalaire.impotNet;
      const netApresIR = round2(totalNet - irTotal + flatTaxDiv); // On ne double-compte pas

      // Recalcul simplifié : net total = salaireNet + dividendesNet, IR sur salaire uniquement (dividendes déjà taxées flat tax)
      const irOnSalaire = computeIR(salaireNet, parts);
      const finalNet = round2(salaireNet - irOnSalaire.impotNet + dividendesNet);

      Object.assign(result, {
        chargesPatronales: chargesSalaire,
        chargesSalariales,
        salaireBrut,
        salaireNet,
        is,
        beneficeDistribuable,
        flatTax: flatTaxDiv,
        dividendesNet,
        charges: round2(ca - finalNet),
        chargesDetail: {
          'Charges patronales': chargesSalaire,
          'Charges salariales': chargesSalariales,
          'IS': is,
          'Flat tax dividendes': flatTaxDiv,
          'IR sur salaire': irOnSalaire.impotNet,
        },
        netAvantIR: round2(salaireNet + dividendesNet),
        ir: irOnSalaire.impotNet,
        netApresIR: finalNet,
        mensuelNet: round2(finalNet / 12),
        tauxCharges: ca > 0 ? round2(((ca - finalNet) / ca) * 100) : 0,
        splitSalaire: splitSalaire * 100,
      });
    } else if (statut === 'eurl') {
      // Rémunération gérant TNS
      const remuBrut = round2(ca * splitSalaire);
      const chargesTNS = round2(remuBrut * TNS_CHARGES_RATE);
      const remuNet = round2(remuBrut - chargesTNS);

      // Bénéfice restant
      const restant = round2(ca - remuBrut);
      const is = computeIS(restant);
      const beneficeDistribuable = round2(restant - is);
      const flatTaxDiv = round2(beneficeDistribuable * FLAT_TAX);
      const dividendesNet = round2(beneficeDistribuable - flatTaxDiv);

      const irOnRemu = computeIR(remuNet, parts);
      const finalNet = round2(remuNet - irOnRemu.impotNet + dividendesNet);

      Object.assign(result, {
        remuBrut,
        chargesTNS,
        remuNet,
        is,
        beneficeDistribuable,
        flatTax: flatTaxDiv,
        dividendesNet,
        charges: round2(ca - finalNet),
        chargesDetail: {
          'Charges TNS (45%)': chargesTNS,
          'IS': is,
          'Flat tax dividendes': flatTaxDiv,
          'IR sur rémunération': irOnRemu.impotNet,
        },
        netAvantIR: round2(remuNet + dividendesNet),
        ir: irOnRemu.impotNet,
        netApresIR: finalNet,
        mensuelNet: round2(finalNet / 12),
        tauxCharges: ca > 0 ? round2(((ca - finalNet) / ca) * 100) : 0,
        splitSalaire: splitSalaire * 100,
      });
    } else if (statut === 'portage') {
      const frais = round2(ca * fraisGestion);
      const apresFrais = round2(ca - frais);
      const charges = round2(apresFrais * PORTAGE_CHARGES_RATE);
      const salaireNet = round2(apresFrais - charges);

      const irResult = computeIR(salaireNet, parts);
      const finalNet = round2(salaireNet - irResult.impotNet);

      Object.assign(result, {
        fraisGestion: frais,
        chargesPortage: charges,
        salaireNet,
        charges: round2(ca - finalNet),
        chargesDetail: {
          [`Frais gestion (${Math.round(fraisGestion * 100)}%)`]: frais,
          'Charges sociales (50%)': charges,
          'IR': irResult.impotNet,
        },
        netAvantIR: salaireNet,
        ir: irResult.impotNet,
        netApresIR: finalNet,
        mensuelNet: round2(finalNet / 12),
        tauxCharges: ca > 0 ? round2(((ca - finalNet) / ca) * 100) : 0,
      });
    }

    return result;
  }

  // ── Salaire Brut → Net ──

  function computeSalaire(params) {
    const brutAnnuel = params.brutAnnuel || 0;
    const cadre = params.cadre !== false;
    const parts = params.parts || 1;

    const tauxCharges = cadre ? SALARIE_CHARGES_CADRE : SALARIE_CHARGES_NON_CADRE;
    const charges = round2(brutAnnuel * tauxCharges);
    const netAvantIR = round2(brutAnnuel - charges);

    const irResult = computeIR(netAvantIR, parts);
    const netApresIR = round2(netAvantIR - irResult.impotNet);

    return {
      brutMensuel: round2(brutAnnuel / 12),
      brutAnnuel: round2(brutAnnuel),
      tauxCharges: tauxCharges * 100,
      charges,
      chargesDetail: {
        [`Cotisations salariales (${cadre ? '25' : '22'}%)`]: charges,
        'IR': irResult.impotNet,
      },
      netMensuelAvantIR: round2(netAvantIR / 12),
      netAnnuelAvantIR: netAvantIR,
      ir: irResult.impotNet,
      irDetail: irResult,
      netMensuelApresIR: round2(netApresIR / 12),
      netAnnuelApresIR: netApresIR,
      coutEmployeur: round2(brutAnnuel * (cadre ? 1.45 : 1.40)),
    };
  }

  // ── Comparateur Freelance vs Salarié ──

  function computeComparaison(freelanceParams, salarieParams) {
    const fl = computeFreelance(freelanceParams);
    const sal = computeSalaire(salarieParams);

    // Trouver le brut équivalent : quel brut donne le même net que le freelance ?
    let lo = 0, hi = freelanceParams.ca * 3;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const test = computeSalaire({ brutAnnuel: mid, cadre: salarieParams.cadre, parts: salarieParams.parts });
      if (test.netAnnuelApresIR < fl.netApresIR) lo = mid;
      else hi = mid;
    }
    const brutEquivalent = round2((lo + hi) / 2);

    return {
      freelance: fl,
      salarie: sal,
      brutEquivalent,
      brutEquivalentMensuel: round2(brutEquivalent / 12),
      avantages: {
        salarie: [
          { label: 'Congés payés', valeur: '5 semaines' },
          { label: 'Assurance chômage', valeur: 'Oui' },
          { label: 'Mutuelle', valeur: 'Prise en charge 50%' },
          { label: 'Retraite complémentaire', valeur: 'Points AGIRC-ARRCO' },
          { label: 'Formation', valeur: 'CPF alimenté' },
        ],
        freelance: [
          { label: 'Congés payés', valeur: 'Non (à provisionner)' },
          { label: 'Assurance chômage', valeur: 'Non (sauf option ATI)' },
          { label: 'Mutuelle', valeur: 'À souscrire soi-même' },
          { label: 'Retraite complémentaire', valeur: 'Variable selon statut' },
          { label: 'Liberté', valeur: 'Choix missions/horaires' },
        ],
      },
    };
  }

  // ── Crypto / Plus-values ──

  function computeCrypto(params) {
    const prixAchat = params.prixAchat || 0;
    const prixVente = params.prixVente || 0;
    const quantite = params.quantite || 1;
    const optionBareme = params.optionBareme || false;
    const parts = params.parts || 1;

    const plusValue = round2((prixVente - prixAchat) * quantite);
    let impot, detail;

    if (plusValue <= 0) {
      return {
        plusValueBrute: plusValue,
        impot: 0,
        impotDetail: {},
        net: plusValue,
        tauxEffectif: 0,
      };
    }

    if (!optionBareme) {
      // PFU / Flat tax 30%
      impot = round2(plusValue * FLAT_TAX);
      detail = { 'Flat tax (30%)': impot };
    } else {
      // Barème progressif + prélèvements sociaux
      const ps = round2(plusValue * CSG_CRDS_RATE);
      const irResult = computeIR(plusValue, parts);
      impot = round2(ps + irResult.impotNet);
      detail = {
        'Prélèvements sociaux (17.2%)': ps,
        'IR (barème)': irResult.impotNet,
      };
    }

    const net = round2(plusValue - impot);
    return {
      plusValueBrute: plusValue,
      impot,
      impotDetail: detail,
      net,
      tauxEffectif: plusValue > 0 ? round2((impot / plusValue) * 100) : 0,
    };
  }

  // ── Export ──

  Calc.Engine = {
    computeIR,
    computeIS,
    computeFreelance,
    computeSalaire,
    computeComparaison,
    computeCrypto,
    formatEuro,
    DEFAULT_JOURS,
  };

})(window.Calc);
