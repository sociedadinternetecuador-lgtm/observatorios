export function repairText(value) {
  if (value == null) return '';
  const text = String(value);
  if (!/[ÃÂ]/.test(text)) return text;

  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8').decode(bytes).replace(/�/g, '');
  } catch {
    return text;
  }
}

function normalize(text) {
  return repairText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function displayItem(item) {
  return Object.fromEntries(
    Object.entries(item || {}).map(([key, value]) => [key, typeof value === 'string' ? repairText(value) : value])
  );
}

function repairDeep(value) {
  if (Array.isArray(value)) return value.map(repairDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairDeep(item)]));
  }
  return typeof value === 'string' ? repairText(value) : value;
}

function indexByName(items) {
  const map = new Map();
  items.forEach((item) => {
    [item.nombre, ...(item.aliases || [])].filter(Boolean).forEach((name) => map.set(normalize(name), item));
  });
  return map;
}

function sumField(items, field) {
  return items.reduce((sum, item) => sum + Number(item?.[field] || 0), 0);
}

function pctOf(value, total) {
  return total ? (Number(value || 0) / total) * 100 : 0;
}

export function buildModel({ inventario, desempeno, riesgos, expansion, geografia, lluvias, mantenimiento }) {
  const capaEstatica = inventario.observatorio_electrico.capa_estatica;
  const capaDinamica = desempeno.observatorio_electrico.capa_dinamica;
  const capaRiesgo = riesgos.observatorio_electrico.capa_vulnerabilidad;
  const capaProspectiva = expansion.observatorio_electrico.capa_prospectiva;
  const capaHidrologica = lluvias ? repairDeep(lluvias.observatorio_electrico) : null;
  const capaMantenimiento = mantenimiento ? repairDeep(mantenimiento.observatorio_electrico) : null;

  const hydro = capaEstatica.inventario_centrales.hidroelectricas.prioritarias_individuales;
  const thermal = [
    { nombre: 'Gonzalo Zevallos', aliases: ['Gonzalo Zevallos (Vapor)'], grupo: 'Base Vapor/Gas', potencia_nominal_mw: 146.00, potencia_efectiva_mw: 140.00 },
    { nombre: 'Trinitaria', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 133.00, potencia_efectiva_mw: 133.00 },
    { nombre: 'Termogas Machala I', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 138.56, potencia_efectiva_mw: 130.60 },
    { nombre: 'Esmeraldas I', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 132.50, potencia_efectiva_mw: 125.00 },
    { nombre: 'Termogas Machala II', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 136.80, potencia_efectiva_mw: 119.00 },
    { nombre: 'Victoria II', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 102.00, potencia_efectiva_mw: 102.00 },
    { nombre: 'Anibal Santos', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 97.00, potencia_efectiva_mw: 97.00 },
    { nombre: 'Enrique Garcia', grupo: 'Base Vapor/Gas', potencia_nominal_mw: 96.00, potencia_efectiva_mw: 96.00 },
    { nombre: 'Jaramijo', grupo: 'MCI y Emergencia', potencia_nominal_mw: 149.22, potencia_efectiva_mw: 128.88 },
    { nombre: 'Esmeraldas II', grupo: 'MCI y Emergencia', potencia_nominal_mw: 84.00, potencia_efectiva_mw: 84.00 },
    { nombre: 'Santa Elena II', grupo: 'MCI y Emergencia', potencia_nominal_mw: 65.03, potencia_efectiva_mw: 65.03 },
    { nombre: 'Alvaro Tinajero', grupo: 'MCI y Emergencia', potencia_nominal_mw: 64.00, potencia_efectiva_mw: 64.00 },
    { nombre: 'Santa Rosa', grupo: 'MCI y Emergencia', potencia_nominal_mw: 51.00, potencia_efectiva_mw: 51.00 },
    { nombre: 'Guangopolo 2', grupo: 'MCI y Emergencia', potencia_nominal_mw: 48.00, potencia_efectiva_mw: 48.00 },
    { nombre: 'Quevedo II', grupo: 'MCI y Emergencia', potencia_nominal_mw: 40.50, potencia_efectiva_mw: 40.50 },
    { nombre: 'Santa Elena III', grupo: 'MCI y Emergencia', potencia_nominal_mw: 40.00, potencia_efectiva_mw: 40.00 },
    { nombre: 'Miraflores', grupo: 'MCI y Emergencia', potencia_nominal_mw: 39.40, potencia_efectiva_mw: 39.40 },
    { nombre: 'G. Hernandez', grupo: 'MCI y Emergencia', potencia_nominal_mw: 31.20, potencia_efectiva_mw: 31.20 },
    { nombre: 'Manta II', grupo: 'MCI y Emergencia', potencia_nominal_mw: 17.34, potencia_efectiva_mw: 17.34 },
    { nombre: 'Barcazas Murat Bey I, II, III', grupo: 'Nuevas Incorporaciones Operativas', potencia_nominal_mw: 295.00, potencia_efectiva_mw: 295.00, nota: 'Bloque operativo 2025' },
    { nombre: 'El Descanso', grupo: 'Nuevas Incorporaciones Operativas', potencia_nominal_mw: 20.00, potencia_efectiva_mw: 20.00 },
    { nombre: 'Gasvesubio', grupo: 'Nuevas Incorporaciones Operativas', potencia_nominal_mw: 13.50, potencia_efectiva_mw: 13.50 },
    { nombre: 'Respaldo termico menor y movil restante', grupo: 'Resto tecnico desglosado', potencia_nominal_mw: 264.55, potencia_efectiva_mw: 264.55, nota: 'Cierre para total de 2145 MW efectivos' }
  ];
  const plantIndex = indexByName([...hydro, ...thermal]);
  const riskAlerts = capaRiesgo.alertas_infraestructura_critica.subestaciones_con_sobrecarga_critica.filter((x) => x.nombre);
  const riskSubIndex = indexByName(riskAlerts);

  const geoCentrales = geografia.centrales.map((raw) => {
    const g = displayItem(raw);
    const match = plantIndex.get(normalize(g.nombre));
    const coca = normalize(g.nombre) === normalize('Coca Codo Sinclair');
    return {
      ...g,
      potencia_nominal_mw: match?.potencia_nominal_mw ?? null,
      potencia_efectiva_mw: match?.potencia_efectiva_mw ?? null,
      riesgo_operativo: coca
        ? repairText(capaRiesgo.alertas_infraestructura_critica.central_coca__codo_sinclair.riesgos_operativos)
        : null
    };
  });

  const geoSubestaciones = geografia.subestaciones.map((raw) => {
    const g = displayItem(raw);
    const match = riskSubIndex.get(normalize(g.nombre));
    const cargabilidad = match?.cargabilidad_actual_porcentaje ?? null;
    return {
      ...g,
      cargabilidad_actual_porcentaje: cargabilidad,
      detalle_cargabilidad: cargabilidad == null
        ? 'Cercana al 100% de cargabilidad. Valor exacto no detallado en la fuente.'
        : null,
      critica: Number(cargabilidad) >= 100
    };
  });

  const geoObras = (geografia.obras_prioritarias || []).map(displayItem);
  const obrasUrgentes = capaRiesgo.obras_prioritarias_urgentes_tabla_37.map(repairText);

  const nominalTotal = capaEstatica.inventario_centrales.resumen_sni_total.potencia_nominal_total_mw;
  const efectivaTotal = capaEstatica.inventario_centrales.resumen_sni_total.potencia_efectiva_total_mw;
  const disponibilidad = pctOf(efectivaTotal, nominalTotal);

  const hydroMainNominal = sumField(hydro, 'potencia_nominal_mw');
  const hydroMainEffective = sumField(hydro, 'potencia_efectiva_mw');
  const hydroOtherNominal = Number(capaEstatica.inventario_centrales.hidroelectricas.otras_centrales_hidricas_sni.potencia_nominal_mw || 0);
  const hydroOtherEffective = Number(capaEstatica.inventario_centrales.hidroelectricas.otras_centrales_hidricas_sni.potencia_efectiva_mw || 0);
  const hydroTotalNominal = hydroMainNominal + hydroOtherNominal;
  const hydroTotalEffective = hydroMainEffective + hydroOtherEffective;

  const thermalMainNominal = sumField(thermal, 'potencia_nominal_mw');
  const thermalMainEffective = sumField(thermal, 'potencia_efectiva_mw');
  const thermalOtherNominal = 0;
  const thermalOtherEffective = 0;
  const thermalTotalNominal = thermalMainNominal + thermalOtherNominal;
  const thermalTotalEffective = thermalMainEffective + thermalOtherEffective;
  const thermalAssetRows = thermal.map(displayItem);
  const thermalGroupTotals = Object.values(thermal.reduce((acc, item) => {
    const group = repairText(item.grupo || 'Sin grupo');
    if (!acc[group]) acc[group] = { grupo: group, nominal_mw: 0, effective_mw: 0, count: 0 };
    acc[group].nominal_mw += Number(item.potencia_nominal_mw || 0);
    acc[group].effective_mw += Number(item.potencia_efectiva_mw || 0);
    acc[group].count += 1;
    return acc;
  }, {}));

  const autogenNominal = Number(capaEstatica.inventario_centrales.capacidad_autogeneracion.total_nominal_mw || 0);
  const autogenEffective = Number(capaEstatica.inventario_centrales.capacidad_autogeneracion.total_efectiva_mw || 0);

  const generationTotal = capaDinamica.balance_nacional_energia.generacion_bruta_total_gwh;
  const systemGross = capaDinamica.balance_nacional_energia.energia_bruta_total_sistema_gwh;
  const imports = capaDinamica.balance_nacional_energia.importaciones_totales_gwh;
  const exports = capaDinamica.balance_nacional_energia.exportaciones_totales_gwh;
  const transmissionLoss = capaDinamica.eficiencia_y_perdidas.transmision_snt.perdidas_gwh;
  const distributionLoss = capaDinamica.eficiencia_y_perdidas.distribucion.perdidas_totales_gwh;
  const attendedDemand = systemGross - exports - transmissionLoss - distributionLoss;

  const renewable = capaDinamica.balance_nacional_energia.matriz_por_fuente.renovable;
  const thermalGeneration = capaDinamica.balance_nacional_energia.matriz_por_fuente.no_renovable_termica.total_gwh;
  const otherRenewables = renewable.detalle.biomasa_gwh + renewable.detalle.eolica_gwh + renewable.detalle.biogas_gwh + renewable.detalle.fotovoltaica_gwh;

  const simplifiedMix = [
    { name: 'Hidráulica', value: renewable.detalle.hidraulica_gwh },
    { name: 'Térmica', value: thermalGeneration },
    { name: 'Otras renovables', value: otherRenewables }
  ].map((item) => ({ ...item, pct: pctOf(item.value, generationTotal) }));

  const otherRenewableRows = [
    { name: 'Biomasa', value: renewable.detalle.biomasa_gwh },
    { name: 'Eólica', value: renewable.detalle.eolica_gwh },
    { name: 'Biogás', value: renewable.detalle.biogas_gwh },
    { name: 'Fotovoltaica', value: renewable.detalle.fotovoltaica_gwh }
  ].map((item) => ({ ...item, pct: pctOf(item.value, generationTotal) }));

  const lossesBreakdown = [
    { name: 'Técnicas', value: capaDinamica.eficiencia_y_perdidas.distribucion.desglose_perdidas.tecnicas_gwh },
    { name: 'No técnicas', value: capaDinamica.eficiencia_y_perdidas.distribucion.desglose_perdidas.no_tecnicas_fraude_gestion_gwh }
  ].map((item) => ({ ...item, pct: pctOf(item.value, distributionLoss) }));

  const energyFlow = [
    { name: 'Generación bruta', value: generationTotal, pct: pctOf(generationTotal, systemGross), kind: 'source' },
    { name: 'Importaciones', value: imports, pct: pctOf(imports, systemGross), kind: 'source' },
    { name: 'Sistema bruto', value: systemGross, pct: 100, kind: 'total' },
    { name: 'Pérdidas transmisión', value: transmissionLoss, pct: pctOf(transmissionLoss, systemGross), kind: 'loss' },
    { name: 'Pérdidas distribución', value: distributionLoss, pct: pctOf(distributionLoss, systemGross), kind: 'loss' },
    { name: 'Exportaciones', value: exports, pct: pctOf(exports, systemGross), kind: 'out' },
    { name: 'Demanda atendida', value: attendedDemand, pct: pctOf(attendedDemand, systemGross), kind: 'demand' }
  ];

  const maintenances = capaMantenimiento?.programacion_centrales_criticas || [];
  const maintenanceUnavailableMw = maintenances.reduce((sum, item) => sum + Number(item.impacto_mw_indisponible || 0), 0);
  const maintenanceRecoveredMw = maintenances.reduce((sum, item) => sum + Number(item.impacto_mw_recuperado || 0), 0);
  const hydroSensitivity = [
    { name: 'Sequía total', lluvia: 0, factor: 0 },
    { name: 'Caudal crítico diciembre 2025', lluvia: 70, factor: 0.7 },
    { name: 'Límite operativo', lluvia: 100, factor: 1 },
    { name: 'Exceso sin mayor generación', lluvia: 130, factor: 1 }
  ];

  const roadmap = [
    ...capaProspectiva.plan_expansion_generacion_peg.proyectos_estrategicos_prioritarios.map((p) => ({
      ...displayItem(p),
      anio: normalize(p.nombre) === 'alluriquin' ? 2026 : normalize(p.nombre) === 'santiago' ? 2030 : normalize(p.nombre) === 'cardenillo' ? 2031 : 2032
    })),
    {
      nombre: 'Bloque ERNC 1',
      tipo: 'ERNC',
      capacidad_mw: capaProspectiva.plan_expansion_generacion_peg.bloques_energias_renovables_no_convencionales_ernc.subtotales.bloque_1_2026_2027,
      anio: 2027,
      estado_pme: 'Bloque 2026-2027'
    },
    {
      nombre: 'Bloque ERNC 2',
      tipo: 'ERNC',
      capacidad_mw: capaProspectiva.plan_expansion_generacion_peg.bloques_energias_renovables_no_convencionales_ernc.subtotales.bloque_2_2027_2028,
      anio: 2028,
      estado_pme: 'Bloque 2027-2028'
    },
    {
      nombre: 'Bloque ERNC 3',
      tipo: 'ERNC',
      capacidad_mw: capaProspectiva.plan_expansion_generacion_peg.bloques_energias_renovables_no_convencionales_ernc.subtotales.bloque_3_2028_2030,
      anio: 2030,
      estado_pme: 'Bloque 2028-2030'
    }
  ].sort((a, b) => a.anio - b.anio);

  const investmentByActivity = Object.entries(capaProspectiva.resumen_inversion_nacional_usd_millones.distribucion_por_actividad)
    .map(([actividad, monto]) => ({ actividad: repairText(actividad), monto }));

  const riskRanking = [
    ...geoSubestaciones.map((x) => ({
      tipo: 'Subestación',
      nombre: x.nombre,
      provincia: x.provincia,
      indicador: x.cargabilidad_actual_porcentaje,
      unidad: x.cargabilidad_actual_porcentaje == null ? 'sin valor exacto' : '% cargabilidad',
      severidad: x.critica ? 'Crítica' : 'Alta',
      detalle: x.detalle_cargabilidad
    })),
    {
      tipo: 'Sistema',
      nombre: 'Déficit de generación identificado',
      provincia: 'Nacional',
      indicador: capaRiesgo.balance_oferta_demanda_riesgo.deficit_generacion_identificado_mw,
      unidad: 'MW',
      severidad: 'Crítica'
    },
    {
      tipo: 'Central',
      nombre: 'Coca Codo Sinclair',
      provincia: 'Napo',
      indicador: 33,
      unidad: 'salidas/año 2025',
      severidad: 'Alta'
    }
  ].sort((a, b) => Number(b.indicador || 0) - Number(a.indicador || 0));

  const cuencas = [
    {
      nombre: 'Cuenca del Paute',
      activos: geoCentrales.filter((x) => ['Molino (Paute)', 'Sopladora', 'Mazar'].includes(x.nombre))
    },
    {
      nombre: 'Eje Tungurahua',
      activos: geoCentrales.filter((x) => ['Agoyán', 'San Francisco'].includes(x.nombre))
    }
  ].map((cuenca) => ({
    ...cuenca,
    potencia_efectiva_total_mw: cuenca.activos.reduce((sum, x) => sum + Number(x.potencia_efectiva_mw || 0), 0)
  }));

  return {
    raw: { capaEstatica, capaDinamica, capaRiesgo, capaProspectiva },
    hidrologia: capaHidrologica,
    mantenimiento: capaMantenimiento,
    maintenances,
    maintenanceUnavailableMw,
    maintenanceRecoveredMw,
    hydroSensitivity,
    geoCentrales,
    geoSubestaciones,
    geoObras,
    obrasUrgentes,
    simplifiedMix,
    otherRenewableRows,
    lossesBreakdown,
    energyFlow,
    roadmap,
    investmentByActivity,
    riskRanking,
    cuencas,
    thermalAssetRows,
    thermalGroupTotals,
    metas2032: capaProspectiva.metas_sectoriales_al_2032,
    ernc: capaProspectiva.plan_expansion_generacion_peg.bloques_energias_renovables_no_convencionales_ernc,
    groups: {
      hydroMainNominal,
      hydroMainEffective,
      hydroOtherNominal,
      hydroOtherEffective,
      hydroTotalNominal,
      hydroTotalEffective,
      thermalMainNominal,
      thermalMainEffective,
      thermalOtherNominal,
      thermalOtherEffective,
      thermalTotalNominal,
      thermalTotalEffective,
      autogenNominal,
      autogenEffective,
      nationalGap: nominalTotal - efectivaTotal
    },
    kpis: {
      nominalTotal,
      efectivaTotal,
      disponibilidad,
      renovablePct: renewable.porcentaje_participacion,
      deficitMW: capaRiesgo.balance_oferta_demanda_riesgo.deficit_generacion_identificado_mw,
      totalInversion: capaProspectiva.resumen_inversion_nacional_usd_millones.total_pme_requerido,
      generationBrutaGwh: generationTotal,
      demandBrutaGwh: systemGross,
      importacionesGwh: imports,
      exportacionesGwh: exports,
      transmissionLossGwh: transmissionLoss,
      distributionLossGwh: distributionLoss,
      distributionLossPct: capaDinamica.eficiencia_y_perdidas.distribucion.porcentaje_total,
      attendedDemandGwh: attendedDemand,
      consumidores: capaDinamica.comercializacion_y_mercado.numero_consumidores_total
    }
  };
}
