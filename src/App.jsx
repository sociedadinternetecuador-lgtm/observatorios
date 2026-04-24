import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Bolt,
  CloudRain,
  Droplets,
  FileDown,
  Info,
  Landmark,
  MapPinned,
  Network,
  ArrowRight,
  SlidersHorizontal,
  ShieldAlert,
  TrendingUp,
  Wrench,
  X,
  ExternalLink,
  Zap
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { fmt, gwh, intFmt, musd, mw, pct } from './lib/formatters.js';
import { buildModel } from './lib/model.js';

const ECUADOR_BOUNDS = [[-5.2, -81.3], [1.8, -75.0]];
const COLORS = ['#38bdf8', '#f59e0b', '#22c55e', '#a78bfa', '#ef4444'];
const HYDRO_EFFECTIVE_BASE_MW = 5387.42;
const DEMAND_MAX_MW = 7893.35;
const SECURITY_RESERVE_MW = 789.34;
const SUFFICIENCY_REQUIREMENT_MW = 8682.69;
const SITE_TITLE = 'Observatorio Eléctrico Nacional';
const STORAGE_TAB_KEY = 'oen-tab-v43';
const THERMAL_EFFECTIVE_BASE_MW = 2145.00;
const AUTOGEN_DEFAULT_SHARE = 0.5;
const CENACE_RISK_CEILING = 25;
const OPEN_MODEL_STRESS_DEFICIT_MW = 2183.46;
const CENACE_HELP_TEXT = 'Este porcentaje sigue la metodología de planificación del Estado. Mide el riesgo de que el país sea incapaz de autoabastecerse en un horizonte de dos años. Está topado al 25% porque asume que el CENACE gestionará las reservas de los embalses (Mazar/Pisayambo) para mitigar un colapso total. Refleja la salud del sistema a largo plazo.';
const OPEN_MODEL_HELP_TEXT = 'Este indicador no tiene techo y mide la certeza física de falla inmediata. Si marca niveles altos (ej. >60%), indica que el déficit de potencia es tan severo que los cortes de energía y racionamientos (como los de 14h vividos anteriormente) son físicamente inevitables hoy mismo. Refleja la crisis operativa del momento.';
const DEFAULT_SITE_CONFIG = {
  title: SITE_TITLE,
  objective: 'Proporcionar transparencia y análisis holístico del Sistema Nacional Interconectado (S.N.I.), facilitando la toma de decisiones y el diseño de políticas de Estado mediante data validada.',
  methodology: 'Aplicación de análisis estadístico multianual y modelación de suficiencia de generación. Se integran criterios de reserva operativa del 10% y escenarios hidrológicos críticos al 70% para determinar la vulnerabilidad estructural del país.',
  cenaceUrl: 'https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm',
  opinion: {
    title: 'Columna de Opinión Técnica',
    path: '/opinion.md'
  },
  links: [
    { label: 'ARCONEL', url: 'https://www.arconel.gob.ec' },
    { label: 'Ministerio de Energía y Minas', url: 'https://www.recursosyenergia.gob.ec' },
    { label: 'CELEC EP', url: 'https://www.celec.gob.ec' },
    { label: 'CNEL EP', url: 'https://www.cnel.gob.ec' }
  ]
};

const TABS = [
  { key: 'inicio', label: 'INICIO', icon: MapPinned },
  { key: 'centrales', label: 'MAPA DE CENTRALES', icon: MapPinned },
  { key: 'balance', label: 'BALANCE Y DÉFICIT', icon: AlertTriangle },
  { key: 'subestaciones', label: 'SUBESTACIONES CRÍTICAS', icon: Network },
  { key: 'expansion', label: 'EXPANSIÓN E INVERSIÓN', icon: Landmark },
  { key: 'hidrologia', label: 'HIDROLOGÍA Y LLUVIAS', icon: CloudRain },
  { key: 'mantenimiento', label: 'MANTENIMIENTO', icon: Wrench },
  { key: 'simulacion', label: 'SIMULACIÓN DE APAGONES', icon: SlidersHorizontal }
];

const tooltipStyle = {
  background: '#08111f',
  border: '1px solid rgba(148, 163, 184, 0.28)',
  borderRadius: 12,
  color: '#e5edf7'
};

function KpiCard({ icon: Icon, label, value, note, tone = 'blue' }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {note ? <small>{note}</small> : null}
      </div>
      <div className="kpi-icon"><Icon size={20} /></div>
    </div>
  );
}

function Panel({ title, subtitle, children, actions = null, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function RiskBadge({ severity }) {
  return <span className={`badge severity-${String(severity).toLowerCase()}`}>{severity}</span>;
}

function SummaryRow({ label, nominal, effective, emphasize = false, onClick }) {
  return (
    <button type="button" className={`summary-row ${emphasize ? 'emphasize' : ''}`} onClick={onClick}>
      <strong>{label}</strong>
      <span>{mw(nominal)}</span>
      <span>{mw(effective)}</span>
    </button>
  );
}

function DataTable({ columns, rows, onRowClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.nombre}-${index}`} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MapLegend() {
  const items = [
    { label: 'Hidroeléctrica', className: 'hydro' },
    { label: 'Termoeléctrica', className: 'thermal' },
    { label: 'Subestación crítica', className: 'critical-sub' },
    { label: 'Subestación / red', className: 'substation' },
    { label: 'Obra prioritaria', className: 'works' }
  ];

  return (
    <div className="map-legend" aria-label="Leyenda del mapa">
      {items.map((item) => (
        <div key={item.label}>
          <span className={`legend-dot ${item.className}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, unit = '', onChange, helper }) {
  return (
    <label className="slider-row">
      <div>
        <span>{label}</span>
        <strong>{fmt.format(value)}{unit}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

function TechnicalSheetModal({ asset, onClose }) {
  if (!asset) return null;
  const rows = [
    ['Nombre', asset.nombre],
    ['Clase', asset.assetClass],
    ['Tipo', asset.tipo || asset.categoria || asset.assetClass],
    ['Subtipo', asset.subtipo],
    ['Provincia', asset.provincia],
    ['Cantón', asset.canton],
    ['Nivel kV', asset.nivel_kv],
    ['Potencia nominal', asset.potencia_nominal_mw != null ? mw(asset.potencia_nominal_mw) : undefined],
    ['Potencia efectiva', asset.potencia_efectiva_mw != null ? mw(asset.potencia_efectiva_mw) : undefined],
    ['Cargabilidad', asset.cargabilidad_actual_porcentaje != null ? pct(asset.cargabilidad_actual_porcentaje) : asset.detalle_cargabilidad],
    ['Estado / criticidad', asset.critica ? 'Crítica' : asset.estado],
    ['Fuente', asset.fuente_geografica || asset.fuente]
  ].filter(([, value]) => value != null && value !== '');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Ficha técnica</span>
            <h3>{asset.nombre}</h3>
            <p>{asset.assetClass}{asset.provincia ? ` · ${asset.provincia}` : ''}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-grid">
          {rows.map(([label, value]) => (
            <div className="sheet-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
          {asset.riesgo_operativo ? <div className="sheet-row full"><span>Riesgo operativo</span><strong>{asset.riesgo_operativo}</strong></div> : null}
          {asset.notas ? <div className="sheet-row full"><span>Notas</span><strong>{asset.notas}</strong></div> : null}
        </div>
      </div>
    </div>
  );
}

function buildProvinceMetrics(model, province) {
  const centrales = model.geoCentrales.filter((item) => item.provincia === province);
  const subestaciones = model.geoSubestaciones.filter((item) => item.provincia === province);
  const nominal = centrales.reduce((sum, item) => sum + Number(item.potencia_nominal_mw || 0), 0);
  const effective = centrales.reduce((sum, item) => sum + Number(item.potencia_efectiva_mw || 0), 0);
  return {
    province,
    centrales: centrales.length,
    subestaciones: subestaciones.length,
    criticas: subestaciones.filter((item) => item.critica).length,
    nominal,
    effective
  };
}

function buildExecutiveExport(model, filters, comparatorA, comparatorB, simulation, simulationResult) {
  return {
    titulo: SITE_TITLE,
    version: SITE_TITLE,
    alcance: 'Observatorio histórico-estructural basado en JSON del proyecto; no usa APIs de tiempo real.',
    filtros_activos: filters,
    mapa_de_centrales: {
      capacidad_sni: {
        nominal_mw: model.kpis.nominalTotal,
        efectiva_mw: model.kpis.efectivaTotal,
        brecha_nominal_efectiva_mw: model.groups.nationalGap
      },
      composicion_parque: {
        hidro_principales: { nominal_mw: model.groups.hydroMainNominal, efectiva_mw: model.groups.hydroMainEffective },
        otras_hidro: { nominal_mw: model.groups.hydroOtherNominal, efectiva_mw: model.groups.hydroOtherEffective },
        total_hidro_sni: { nominal_mw: model.groups.hydroTotalNominal, efectiva_mw: model.groups.hydroTotalEffective },
        parque_termico_desglosado: model.thermalAssetRows,
        parque_termico_por_grupo: model.thermalGroupTotals,
        total_termico_sni: { nominal_mw: model.groups.thermalTotalNominal, efectiva_mw: model.groups.thermalTotalEffective },
        autogeneracion_fuera_sni: { nominal_mw: model.groups.autogenNominal, efectiva_mw: model.groups.autogenEffective }
      },
      centrales_georreferenciadas: model.geoCentrales,
      comparador_provincial: { provincia_a: comparatorA, provincia_b: comparatorB }
    },
    balance_y_deficit: {
      generacion_bruta_gwh: model.kpis.generationBrutaGwh,
      importaciones_gwh: model.kpis.importacionesGwh,
      exportaciones_gwh: model.kpis.exportacionesGwh,
      energia_bruta_sistema_gwh: model.kpis.demandBrutaGwh,
      demanda_atendida_calculada_gwh: model.kpis.attendedDemandGwh,
      perdidas_transmision_gwh: model.kpis.transmissionLossGwh,
      perdidas_distribucion_gwh: model.kpis.distributionLossGwh,
      perdidas_distribucion_porcentaje: model.kpis.distributionLossPct,
      deficit_estructural_mw: model.kpis.deficitMW,
      matriz_simplificada: model.simplifiedMix,
      otras_renovables: model.otherRenewableRows,
      desglose_perdidas: model.lossesBreakdown,
      flujo_energetico: model.energyFlow,
      consistencia_fuentes: {
        capacidad_sni: 'Consistente con Tabla Nro. 4 de la Estadística 2025',
        deficit_estructural: 'Consistente con Circular CENACE-2026-0005-C',
        perdidas_distribucion: 'Consistente con Estadística 2025',
        subestaciones_criticas: 'Consistente con registros operativos oficiales'
      },
      criterio_deficit_cenace: {
        formula: 'Déficit = Oferta total simulada - Punto de equilibrio',
        carga_actual_del_sistema_mw: DEMAND_MAX_MW,
        reserva_de_seguridad_mw: SECURITY_RESERVE_MW,
        punto_de_equilibrio_mw: SUFFICIENCY_REQUIREMENT_MW,
        generacion_firme: 'Potencia efectiva ajustada por indisponibilidad técnica; no potencia nominal',
        deficit_reportado_mw: model.kpis.deficitMW
      },
      probabilidad_oficial: {
        metodologia: 'Modelación estocástica mensual de caudales y percentiles de energía no suministrada',
        inicio_2026: model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.inicio_2026,
        octubre_2026_marzo_2027: model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.octubre_2026_marzo_2027,
        vulnerabilidad_estructural_global: model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.vulnerabilidad_estructural_global,
        cens_usd_cent_kwh: model.raw.capaRiesgo.balance_oferta_demanda_riesgo.costo_energia_no_suministrada_cens_usd_cent_kwh,
        impacto_percentil_50_musd: model.hidrologia?.indicadores_economicos_por_sequia.impacto_estimado_percentil_50,
        impacto_percentil_98_musd: model.hidrologia?.indicadores_economicos_por_sequia.impacto_sequia_extrema_percentil_98
      }
    },
    subestaciones_criticas: {
      subestaciones: model.geoSubestaciones,
      ranking_riesgo: model.riskRanking,
      obras_prioritarias_urgentes: model.obrasUrgentes
    },
    expansion_e_inversion: {
      inversion_total_musd: model.kpis.totalInversion,
      inversiones_por_actividad: model.investmentByActivity,
      timeline: model.roadmap,
      bloques_ernc: model.ernc,
      metas_2032: model.metas2032,
      cuencas_estrategicas: model.cuencas
    },
    hidrologia_y_lluvias: model.hidrologia,
    mantenimiento: {
      metadata: model.mantenimiento?.metadata_mantenimientos,
      programacion_centrales_criticas: model.maintenances,
      mw_indisponible_programado: model.maintenanceUnavailableMw,
      mw_recuperado: model.maintenanceRecoveredMw,
      restricciones_y_politica: model.mantenimiento?.restricciones_y_politica_de_mantenimiento,
      gestion_activos_transmision: model.mantenimiento?.gestion_de_activos_transmision,
      responsabilidades: model.mantenimiento?.responsabilidades
    },
    simulacion_apagones: {
      parametros: simulation,
        resultado: {
          disponible_simulado_mw: simulationResult.totalAvailable,
        demanda_maxima_proyectada_mw: simulationResult.projectedPeakDemand,
        reserva_operativa_10_mw: simulationResult.operatingReserve,
        requerimiento_suficiencia_mw: simulationResult.adequacyRequirement,
        oferta_total_simulada_mw: simulationResult.totalAvailable,
        balance_oferta_demanda_mw: simulationResult.balanceMW,
        deficit_o_margen_mw: simulationResult.balanceMW,
        modelo_a_cenace_vulnerabilidad_estructural_porcentaje: simulationResult.outageProbability,
        modelo_b_abierto_fragilidad_operativa_porcentaje: simulationResult.openFragility,
        brecha_extrema_referencia_mw: simulationResult.openModelReferenceDeficit,
        impacto_mantenimiento_mw: simulationResult.maintenanceImpact,
          factor_lluvia_aplicado_porcentaje: simulationResult.rainFactor * 100,
        desglose: {
          base_hidroelectrica_mw: HYDRO_EFFECTIVE_BASE_MW,
          base_termica_mw: THERMAL_EFFECTIVE_BASE_MW,
          mantenimiento_hidro_mw: simulationResult.hydroMaintenanceImpact,
          mantenimiento_termico_mw: simulationResult.thermalMaintenanceImpact,
          hidroelectrica_mw: simulationResult.hydroAvailable,
          termica_mw: simulationResult.thermalAvailable,
          autogeneracion_mw: simulationResult.autogenAvailable,
          importacion_colombia_mw: simulationResult.firmImport
        },
        criterio: 'El indicador CENACE se fija en el techo estructural de 25% y la explicación metodológica queda disponible en el botón de ayuda. El modelo abierto conserva la fragilidad física sin tope.'
      }
    }
  };
}

function makeExecutivePdf(model, filters, comparatorA, comparatorB, simulation, simulationResult) {
  const exportData = buildExecutiveExport(model, filters, comparatorA, comparatorB, simulation, simulationResult);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 48;
  const line = (text, size = 11, gap = 17, weight = 'normal') => {
    if (y > 760) { doc.addPage(); y = 48; }
    doc.setFont('helvetica', weight);
    doc.setFontSize(size);
    const split = doc.splitTextToSize(text, 520);
    doc.text(split, 40, y);
    y += split.length * gap;
  };
  const section = (title) => {
    if (y > 740) { doc.addPage(); y = 48; }
    y += 10;
    doc.setDrawColor(120, 137, 160);
    doc.line(40, y, 555, y);
    y += 22;
    line(title, 14, 18, 'bold');
  };

  const kv = (label, value) => line(`${label}: ${value}.`, 10, 15);
  const list = (items, render, max = items.length) => items.slice(0, max).forEach((item) => line(`- ${render(item)}`, 9.5, 14));

  line(exportData.titulo, 20, 24, 'bold');
  line(`Resumen ejecutivo completo exportado desde ${SITE_TITLE}.`, 10, 16);
  line(`Filtro provincial activo: ${filters.provincia}. Filtro de tecnología: ${filters.tipo}. Solo subestaciones críticas: ${filters.soloCriticas ? 'Sí' : 'No'}.`, 10, 16);

  section('1. Mapa de centrales y composición del parque');
  kv('Capacidad nominal S.N.I.', mw(model.kpis.nominalTotal));
  kv('Capacidad efectiva S.N.I.', mw(model.kpis.efectivaTotal));
  kv('Brecha nominal-efectiva', mw(model.groups.nationalGap));
  kv('Hidro principales', `${mw(model.groups.hydroMainNominal)} nominales / ${mw(model.groups.hydroMainEffective)} efectivos`);
  kv('Otras hidro', `${mw(model.groups.hydroOtherNominal)} nominales / ${mw(model.groups.hydroOtherEffective)} efectivos`);
  kv('Total hidro S.N.I.', `${mw(model.groups.hydroTotalNominal)} nominales / ${mw(model.groups.hydroTotalEffective)} efectivos`);
  kv('Parque térmico desglosado', `${model.thermalAssetRows.length} activos individuales`);
  kv('Total térmico S.N.I.', `${mw(model.groups.thermalTotalNominal)} nominales / ${mw(model.groups.thermalTotalEffective)} efectivos`);
  kv('Autogeneración fuera del S.N.I.', `${mw(model.groups.autogenNominal)} nominales / ${mw(model.groups.autogenEffective)} efectivos`);
  line('Centrales georreferenciadas:', 10, 15, 'bold');
  list(model.geoCentrales, (item) => `${item.nombre} (${item.tipo}, ${item.provincia}) - efectiva ${mw(item.potencia_efectiva_mw)}`);
  kv(`Comparador ${comparatorA.province}`, `${comparatorA.centrales} centrales, ${comparatorA.subestaciones} subestaciones, ${comparatorA.criticas} críticas, ${mw(comparatorA.effective)} efectivos`);
  kv(`Comparador ${comparatorB.province}`, `${comparatorB.centrales} centrales, ${comparatorB.subestaciones} subestaciones, ${comparatorB.criticas} críticas, ${mw(comparatorB.effective)} efectivos`);

  section('2. Balance y déficit');
  kv('Generación bruta 2025', gwh(model.kpis.generationBrutaGwh));
  kv('Importaciones', gwh(model.kpis.importacionesGwh));
  kv('Exportaciones', gwh(model.kpis.exportacionesGwh));
  kv('Energía bruta total sistema', gwh(model.kpis.demandBrutaGwh));
  kv('Demanda atendida calculada', gwh(model.kpis.attendedDemandGwh));
  kv('Pérdidas transmisión', gwh(model.kpis.transmissionLossGwh));
  kv('Pérdidas distribución', `${gwh(model.kpis.distributionLossGwh)} / ${pct(model.kpis.distributionLossPct)}`);
  kv('Balance oferta-demanda estructural', mw(model.kpis.deficitMW));
  line('Matriz simplificada:', 10, 15, 'bold');
  list(model.simplifiedMix, (item) => `${item.name}: ${gwh(item.value)} (${pct(item.pct)} de generación bruta)`);
  line('Otras renovables:', 10, 15, 'bold');
  list(model.otherRenewableRows, (item) => `${item.name}: ${gwh(item.value)} (${pct(item.pct)} de generación bruta)`);
  line('Pérdidas en distribución:', 10, 15, 'bold');
  list(model.lossesBreakdown, (item) => `${item.name}: ${gwh(item.value)} (${pct(item.pct)} de pérdidas de distribución)`);
  line('Consistencia metodológica y criterio CENACE:', 10, 15, 'bold');
  kv('Capacidad S.N.I.', `${mw(model.kpis.nominalTotal)} nominales y ${mw(model.kpis.efectivaTotal)} efectivos; consistente con Tabla Nro. 4 de la Estadística 2025`);
  kv('Balance oferta-demanda estructural', `${mw(model.kpis.deficitMW)}; consistente con Circular CENACE-2026-0005-C`);
  kv('Pérdidas distribución', `${pct(model.kpis.distributionLossPct)}; consistente con Estadística 2025`);
  kv('Fórmula de suficiencia', 'Déficit = Oferta total simulada - Punto de equilibrio');
  kv('Generación firme', 'Potencia efectiva ajustada por indisponibilidad técnica; no potencia nominal');
  kv('Probabilidad oficial global', model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.vulnerabilidad_estructural_global);
  kv('Riesgo enero-marzo 2026', model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.inicio_2026);
  kv('Riesgo octubre 2026-marzo 2027', model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.octubre_2026_marzo_2027);
  kv('CENS', `${fmt.format(model.raw.capaRiesgo.balance_oferta_demanda_riesgo.costo_energia_no_suministrada_cens_usd_cent_kwh)} USD c/kWh`);
  kv('Impacto económico esperado', musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_estimado_percentil_50));
  kv('Impacto sequía extrema P98', musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_sequia_extrema_percentil_98));

  section('3. Subestaciones críticas');
  line('Las subestaciones no generan energía; son nodos críticos de transformación y entrega.', 10, 15);
  model.geoSubestaciones.forEach((item) => line(`${item.nombre}: ${item.cargabilidad_actual_porcentaje != null ? pct(item.cargabilidad_actual_porcentaje) : item.detalle_cargabilidad}.`, 10, 16));
  line('Obras prioritarias urgentes:', 10, 15, 'bold');
  list(model.obrasUrgentes, (item) => item);

  section('4. Expansión e inversión');
  kv('Inversión total PME 2023-2032', musd(model.kpis.totalInversion));
  list(model.investmentByActivity, (item) => `${item.actividad}: ${musd(item.monto)}`);
  line('Timeline de expansión:', 10, 15, 'bold');
  list(model.roadmap, (item) => `${item.anio}: ${item.nombre} (${item.tipo}) - ${mw(item.capacidad_mw)}`);
  kv('Bloques ERNC total', mw(model.ernc.total_mw));
  kv('Bloque ERNC 1', mw(model.ernc.subtotales.bloque_1_2026_2027));
  kv('Bloque ERNC 2', mw(model.ernc.subtotales.bloque_2_2027_2028));
  kv('Bloque ERNC 3', mw(model.ernc.subtotales.bloque_3_2028_2030));
  kv('Meta cobertura 2032', model.metas2032.cobertura_servicio_nacional_objetivo);
  kv('Meta pérdidas distribución 2032', model.metas2032.reduccion_perdidas_distribucion_meta);
  kv('Generación firme térmica 2032', mw(model.metas2032.incorporacion_generacion_firme_termica_mw));
  kv('Movilidad eléctrica 2032', `${intFmt.format(model.metas2032.movilidad_electrica_proyeccion_unidades)} unidades`);

  section('5. Hidrología y lluvias');
  const oriental = model.hidrologia.clasificacion_cuencas.vertiente_oriental_amazonica;
  const occidental = model.hidrologia.clasificacion_cuencas.vertiente_occidental_pacifico;
  kv('Fuente hidrológica', model.hidrologia.metadata_hidrologica.fuente_primaria);
  kv('Vertiente oriental amazónica', oriental.descripcion);
  kv('Estiaje oriental', oriental.estacionalidad_estiaje);
  kv('Caudal crítico diciembre 2025', `${fmt.format(oriental.comportamiento_historico_reciente.caso_critico_dic_2025.caudal_real_m3_s)} m3/s`);
  kv('Respecto media histórica', pct(oriental.comportamiento_historico_reciente.caso_critico_dic_2025.porcentaje_respecto_media_historica));
  kv('Vertiente occidental pacífico', occidental.descripcion);
  kv('Estiaje occidental', occidental.estacionalidad_estiaje);
  kv('Probabilidad déficit hidrológico crítico', model.hidrologia.modelacion_y_proyeccion_caudales.escenarios_riesgo_2026_2027.probabilidad_deficit_hidrologico_critico);
  kv('Impacto sequía percentil 50', musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_estimado_percentil_50));
  kv('Impacto sequía extrema percentil 98', musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_sequia_extrema_percentil_98));

  section('6. Mantenimiento y operación');
  kv('Fuente mantenimiento', model.mantenimiento.metadata_mantenimientos.fuente);
  kv('Fecha emisión', model.mantenimiento.metadata_mantenimientos.fecha_emision);
  kv('MW indisponibles programados', mw(model.maintenanceUnavailableMw));
  kv('MW recuperados', mw(model.maintenanceRecoveredMw));
  list(model.maintenances, (item) => `${item.central}: ${item.estado_actual}; ${item.tipo_trabajo}; ${item.impacto_mw_indisponible ? `${mw(item.impacto_mw_indisponible)} indisponibles` : item.impacto_mw_recuperado ? `${mw(item.impacto_mw_recuperado)} recuperados` : item.nueva_fecha_estimada || item.fecha_reintegro}`);
  kv('Regla de oro', model.mantenimiento.restricciones_y_politica_de_mantenimiento.regla_de_oro);
  kv('Alerta de planificación', model.mantenimiento.restricciones_y_politica_de_mantenimiento.alerta_de_planificacion);
  line('Factores condicionantes:', 10, 15, 'bold');
  list(model.mantenimiento.restricciones_y_politica_de_mantenimiento.factores_condicionantes, (item) => item);

  section('7. Simulación de apagones');
  kv('Base hidroeléctrica efectiva', mw(HYDRO_EFFECTIVE_BASE_MW));
  kv('Base térmica efectiva', mw(THERMAL_EFFECTIVE_BASE_MW));
  kv('Nivel de lluvia simulado', `${simulation.rainPct}%`);
  kv('Mantenimiento hidro descontado antes de lluvia', mw(simulationResult.hydroMaintenanceImpact));
  kv('Autogeneración simulada', `${pct(simulation.autogenPct)} de ${mw(model.groups.autogenEffective)}`);
  kv('Importación Colombia simulada', mw(simulationResult.firmImport));
  kv('Oferta total simulada', mw(simulationResult.totalAvailable));
  kv('Carga actual del sistema', mw(simulationResult.projectedPeakDemand));
  kv('Reserva de seguridad', mw(simulationResult.operatingReserve));
  kv('Punto de equilibrio', mw(simulationResult.adequacyRequirement));
  kv(simulationResult.balanceMW < 0 ? 'Déficit simulado' : 'Superávit simulado', mw(simulationResult.balanceMW));
  kv('Modelo A CENACE - vulnerabilidad estructural', pct(simulationResult.outageProbability));
  kv('Modelo B abierto - fragilidad operativa', pct(simulationResult.openFragility));
  kv('Brecha extrema de referencia', mw(simulationResult.openModelReferenceDeficit));
  kv('Techo oficial aplicado', '25% máximo documentado por CENACE para escenarios hidrológicos críticos');
  kv('Impacto mantenimiento activo', mw(simulationResult.maintenanceImpact));

  doc.save('observatorio-electrico-nacional-resumen-ejecutivo.pdf');
}

function downloadExecutiveJson(model, filters, comparatorA, comparatorB, simulation, simulationResult) {
  const data = buildExecutiveExport(model, filters, comparatorA, comparatorB, simulation, simulationResult);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'observatorio-electrico-nacional-export.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function fetchJsonAsset(path) {
  const response = await fetch(path);
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    throw new Error(`No se pudo cargar ${path}. Verifica que el archivo exista en public/data y reinicia Vite si el servidor estaba abierto.`);
  }
  return response.json();
}

function EnergyFlow({ model }) {
  const max = model.kpis.demandBrutaGwh;
  return (
    <div className="energy-flow" aria-label="Flujo energético nacional 2025">
      <div className="flow-sources">
        {model.energyFlow.slice(0, 2).map((item) => (
          <div className="flow-card source" key={item.name}>
            <span>{item.name}</span>
            <strong>{gwh(item.value)}</strong>
            <small>{pct(item.pct)} del sistema bruto</small>
          </div>
        ))}
      </div>
      <div className="flow-spine">
        {model.energyFlow.slice(2).map((item) => (
          <div className={`flow-row ${item.kind}`} key={item.name}>
            <div className="flow-label">
              <strong>{item.name}</strong>
              <span>{gwh(item.value)} · {pct(item.pct)}</span>
            </div>
            <div className="flow-track">
              <div style={{ width: `${Math.max((item.value / max) * 100, 1.8)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkdownArticle({ markdown }) {
  const blocks = useMemo(() => {
    if (!markdown) return [];
    const lines = markdown.split(/\r?\n/);
    const nodes = [];
    let index = 0;

    while (index < lines.length) {
      const raw = lines[index].trimEnd();
      const line = raw.trim();
      if (!line) {
        index += 1;
        continue;
      }

      if (line.startsWith('## ')) {
        nodes.push(<h4 key={`h2-${index}`}>{line.slice(3)}</h4>);
        index += 1;
        continue;
      }

      if (line.startsWith('# ')) {
        nodes.push(<h3 key={`h1-${index}`}>{line.slice(2)}</h3>);
        index += 1;
        continue;
      }

      if (line.startsWith('- ')) {
        const items = [];
        while (index < lines.length && lines[index].trim().startsWith('- ')) {
          items.push(lines[index].trim().slice(2));
          index += 1;
        }
        nodes.push(
          <ul key={`ul-${index}`}>
            {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}
          </ul>
        );
        continue;
      }

      const paragraph = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (!current || current.startsWith('#') || current.startsWith('- ')) break;
        paragraph.push(current);
        index += 1;
      }
      nodes.push(<p key={`p-${index}`}>{paragraph.join(' ')}</p>);
    }

    return nodes;
  }, [markdown]);

  return <div className="markdown-article">{blocks}</div>;
}

function HomePage({ siteConfig, opinionMarkdown }) {
  const objectiveCards = [
    { label: 'Objetivo del observatorio', value: siteConfig.objective },
    { label: 'Metodología', value: siteConfig.methodology },
    { label: 'Base operativa', value: 'PME 2023-2032, Estadística del Sector Eléctrico 2025 y Plan de Operación CENACE 2026-2027.' }
  ];

  return (
    <div className="home-page">
      <section className="home-hero panel">
        <div className="home-hero-brand">
          <img src="/ote-horizontal.svg" alt="Observatorio Eléctrico Nacional" className="home-logo" />
          <span className="eyebrow">Sistema de análisis histórico-estructural</span>
          <h1>{siteConfig.title}</h1>
          <p>{siteConfig.objective}</p>
          <div className="hero-actions">
            <a className="topbar-btn external" href={siteConfig.cenaceUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Información Operativa en Tiempo Real - CENACE
            </a>
          </div>
        </div>

        <div className="home-hero-grid">
          {objectiveCards.map((card) => (
            <div className="home-hero-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="home-grid">
        <Panel title="Fuentes oficiales" subtitle="Marco documental que alimenta el análisis del observatorio.">
          <div className="official-sources">
            <div className="official-source">
              <strong>Plan Maestro de Electricidad (PME) 2023-2032</strong>
              <p>Instrumento rector de la planificación sectorial.</p>
            </div>
            <div className="official-source">
              <strong>Estadística del Sector Eléctrico 2025</strong>
              <p>Consolidado de indicadores de generación, transmisión y distribución.</p>
            </div>
            <div className="official-source">
              <strong>Plan de Operación CENACE 2026-2027</strong>
              <p>Base para la programación operativa y la gestión de riesgos.</p>
            </div>
          </div>
        </Panel>

        <Panel title={siteConfig.opinion?.title || 'Columna de Opinión Técnica'} subtitle="Contenedor externo para opinion.md.">
          {opinionMarkdown ? <MarkdownArticle markdown={opinionMarkdown} /> : <div className="empty-note">Cargando opinión técnica...</div>}
        </Panel>
      </section>

      <section className="home-links panel">
        <div className="panel-header">
          <div>
            <h2>Directorio de enlaces oficiales</h2>
            <p>Accesos de referencia para consulta institucional y operativa.</p>
          </div>
        </div>
        <div className="link-grid">
          {siteConfig.links.map((item) => (
            <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="official-link">
              <span>{item.label}</span>
              <ExternalLink size={15} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomePagePremium({ siteConfig, opinionMarkdown, onExportPdf, onExportJson, isExportingPdf }) {
  return (
    <div className="home-page premium">
      <section className="home-hero panel">
        <div className="home-hero-brand">
          <img src="/ote-horizontal.svg" alt="Observatorio Eléctrico Nacional" className="home-logo home-logo-large" />
          <span className="eyebrow">Sistema de análisis histórico-estructural</span>
          <h1>{siteConfig.title}</h1>
          <p>{siteConfig.objective}</p>
          <div className="hero-summary">
            <div>
              <span>Metodología</span>
              <strong>{siteConfig.methodology}</strong>
            </div>
            <div>
              <span>Base documental</span>
              <strong>PME 2023-2032, Estadística del Sector Eléctrico 2025 y Plan de Operación CENACE 2026-2027.</strong>
            </div>
          </div>
          <div className="hero-actions">
            <a className="topbar-btn external" href={siteConfig.cenaceUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Información Operativa en Tiempo Real - CENACE
            </a>
          </div>
        </div>
      </section>

      <section className="home-grid premium-grid">
        <div className="home-main-column">
          <Panel title="Fuentes oficiales" subtitle="Marco documental que alimenta el análisis del observatorio.">
            <div className="official-sources">
              <div className="official-source">
                <strong>Plan Maestro de Electricidad (PME) 2023-2032</strong>
                <p>Instrumento rector de la planificación sectorial.</p>
              </div>
              <div className="official-source">
                <strong>Estadística del Sector Eléctrico 2025</strong>
                <p>Consolidado de indicadores de generación, transmisión y distribución.</p>
              </div>
              <div className="official-source">
                <strong>Plan de Operación CENACE 2026-2027</strong>
                <p>Base para la programación operativa y la gestión de riesgos.</p>
              </div>
            </div>
          </Panel>

          <Panel title={siteConfig.opinion?.title || 'Columna de Opinión Técnica'} subtitle="Artículo del mes cargado desde opinion.md.">
            {opinionMarkdown ? <MarkdownArticle markdown={opinionMarkdown} /> : <div className="empty-note">Cargando opinión técnica...</div>}
          </Panel>
        </div>

        <aside className="home-links home-links-sticky panel">
          <div className="panel-header">
            <div>
              <h2>Enlaces oficiales</h2>
              <p>Accesos institucionales de consulta directa.</p>
            </div>
          </div>
          <div className="link-grid sidebar-links">
            {siteConfig.links.map((item) => (
              <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="official-link">
                <span>{item.label}</span>
                <ExternalLink size={15} />
              </a>
            ))}
          </div>
        </aside>
      </section>

      <section className="home-export panel">
        <div className="home-export-copy">
          <span className="eyebrow">Exportación</span>
          <strong>PDF y JSON</strong>
          <p>Descarga el informe visual con una hoja por pestaña y el archivo estructurado con la información consolidada.</p>
        </div>
        <div className="home-export-actions">
          <button className="topbar-btn export-btn" onClick={onExportPdf} disabled={isExportingPdf}>
            <FileDown size={16} /> {isExportingPdf ? 'Generando...' : 'PDF'}
          </button>
          <button className="topbar-btn export-btn" onClick={onExportJson}>
            <FileDown size={16} /> JSON
          </button>
        </div>
      </section>
    </div>
  );
}

function stripLeadingHeading(markdown, title) {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  const filtered = [];
  let removedHeading = false;
  const normalizedTitle = (title || '').trim().toLowerCase();

  for (const line of lines) {
    if (!removedHeading && line.trim().startsWith('# ')) {
      const heading = line.trim().slice(2).trim().toLowerCase();
      if (!normalizedTitle || heading === normalizedTitle || heading.includes('opinión técnica') || heading.includes('opinion tecnica')) {
        removedHeading = true;
        continue;
      }
    }
    filtered.push(line);
  }

  return filtered.join('\n').trim();
}

function HomePageEntry({ siteConfig, opinionMarkdown, onExportPdf, onExportJson, isExportingPdf, onNavigateTab, showOpinionFull, onToggleOpinionFull }) {
  const opinionTitle = siteConfig.opinion?.title || 'Columna de Opinión Técnica';
  const opinionBody = useMemo(() => stripLeadingHeading(opinionMarkdown, opinionTitle), [opinionMarkdown, opinionTitle]);

  return (
    <div className="home-page entry">
      <section className="home-entry-shell panel">
        <div className="home-entry-top">
          <div className="home-entry-brand panel">
            <img src="/ote-horizontal.svg" alt="Observatorio Eléctrico Nacional" className="home-logo entry-logo" />
            <span className="eyebrow">República del Ecuador</span>
            <h1>{siteConfig.title}</h1>
            <p>{siteConfig.objective}</p>
            <p className="home-hero-subtitle">{siteConfig.methodology}</p>
          </div>
          <div className="home-entry-actions panel">
            <span className="eyebrow">Exportar Datos del Observatorio</span>
            <div className="home-action-buttons">
              <button className="topbar-btn export-btn" onClick={onExportPdf} disabled={isExportingPdf}>
                <FileDown size={16} /> {isExportingPdf ? 'Generando...' : 'PDF'}
              </button>
              <button className="topbar-btn export-btn" onClick={onExportJson}>
                <FileDown size={16} /> JSON
              </button>
            </div>
          </div>
        </div>

        <div className="home-body-grid">
          <aside className="home-quick panel">
            <div className="panel-header compact">
              <div>
                <h2>Accesos rápidos</h2>
                <p>Navegación interna del observatorio.</p>
              </div>
            </div>
            <div className="quick-action-list">
              {[
                ['centrales', 'Mapa de centrales'],
                ['balance', 'Balance y déficit'],
                ['subestaciones', 'Subestaciones críticas'],
                ['expansion', 'Expansión e inversión'],
                ['hidrologia', 'Hidrología y lluvias'],
                ['mantenimiento', 'Mantenimiento'],
                ['simulacion', 'Simulación de apagones']
              ].map(([tabKey, label]) => (
                <button key={tabKey} type="button" className="quick-action" onClick={() => onNavigateTab?.(tabKey)}>
                  <span>{label}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>

            <div className="home-sources-block">
              <div className="panel-header compact">
                <div>
                  <h2>Fuentes</h2>
                  <p>Marco documental que alimenta el análisis del observatorio.</p>
                </div>
              </div>
              <div className="footer-sources-text">
                <p><strong>Plan Maestro de Electricidad (PME) 2023-2032:</strong> instrumento rector de la planificación sectorial.</p>
                <p><strong>Estadística del Sector Eléctrico 2025:</strong> consolidado de indicadores de generación, transmisión y distribución.</p>
                <p><strong>Plan de Operación CENACE 2026-2027:</strong> base para la programación operativa y la gestión de riesgos.</p>
              </div>
            </div>
          </aside>

          <section className="home-center-column">
            <div className="home-opinion-card panel">
              <div className="panel-header compact">
                <div>
                  <h2>{opinionTitle}</h2>
                  <p>Artículo del mes cargado desde opinion.md.</p>
                </div>
              </div>
              {opinionBody ? (
                <>
                  <div className={`home-opinion-body ${showOpinionFull ? 'expanded' : 'collapsed'}`}>
                    <MarkdownArticle markdown={opinionBody} />
                  </div>
                  {!showOpinionFull ? (
                    <button type="button" className="read-more-link" onClick={() => onToggleOpinionFull?.(true)}>
                      Leer más
                    </button>
                  ) : (
                    <button type="button" className="read-more-link" onClick={() => onToggleOpinionFull?.(false)}>
                      Ver menos
                    </button>
                  )}
                </>
              ) : <div className="empty-note">Cargando opinión técnica...</div>}
            </div>
          </section>

          <aside className="home-interest-column">
            <section className="interest-card panel">
              <div className="panel-header compact">
                <div>
                  <h2>Sitios de interés</h2>
                  <p>Enlaces oficiales de consulta directa.</p>
                </div>
              </div>
              <div className="link-grid sidebar-links">
                <a href={siteConfig.cenaceUrl} target="_blank" rel="noreferrer" className="official-link official-link-highlight">
                  <span>CENACE</span>
                  <ExternalLink size={15} />
                </a>
                {siteConfig.links.map((item) => (
                  <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="official-link">
                    <span>{item.label}</span>
                    <ExternalLink size={15} />
                  </a>
                ))}
              </div>
            </section>

            <section className="interest-card panel">
              <div className="panel-header compact">
                <div>
                  <h2>Contacto</h2>
                  <p>observatorios@corpece.org.ec</p>
                </div>
              </div>
              <form className="contact-form contact-mini" onSubmit={(event) => event.preventDefault()}>
                <label>
                  <span>Nombre</span>
                  <input type="text" placeholder="Tu nombre" />
                </label>
                <label>
                  <span>Correo</span>
                  <input type="email" placeholder="tu@correo.com" />
                </label>
                <label className="policy-check">
                  <input type="checkbox" required />
                  <span>Acepto la política de protección de datos antes de enviar.</span>
                </label>
                <button className="topbar-btn export-btn" type="submit">Enviar comentario</button>
              </form>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState({ loading: true, error: null });
  const [siteConfig, setSiteConfig] = useState(DEFAULT_SITE_CONFIG);
  const [opinionMarkdown, setOpinionMarkdown] = useState('');
  const exportAreaRef = useRef(null);
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('oen-filters-v42');
    return saved ? JSON.parse(saved) : {
      provincia: 'Todas',
      tipo: 'Todos',
      soloCriticas: false,
      showCentrales: true,
      showSubestaciones: true,
      showObras: true
    };
  });
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(STORAGE_TAB_KEY) || 'inicio');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [comparator, setComparator] = useState({ a: 'Azuay', b: 'Guayas' });
  const [showBalanceMethodology, setShowBalanceMethodology] = useState(false);
  const [activeProbabilityHelp, setActiveProbabilityHelp] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showOpinionFull, setShowOpinionFull] = useState(false);
  const [simulation, setSimulation] = useState({
    rainPct: 70,
    autogenPct: 50,
    colombiaMw: 0,
    maintenanceIds: []
  });
  const tabThemeClass = {
    centrales: 'tab-centrales',
    balance: 'tab-balance',
    subestaciones: 'tab-subestaciones',
    expansion: 'tab-expansion',
    hidrologia: 'tab-hidrologia',
    mantenimiento: 'tab-mantenimiento',
    simulacion: 'tab-simulacion'
  }[activeTab] || 'tab-centrales';

  useEffect(() => { localStorage.setItem('oen-filters-v42', JSON.stringify(filters)); }, [filters]);
  useEffect(() => { localStorage.setItem(STORAGE_TAB_KEY, activeTab); }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    async function loadSiteConfig() {
      try {
        const config = await fetchJsonAsset('/config_site.json');
        if (!cancelled) setSiteConfig({
          ...DEFAULT_SITE_CONFIG,
          ...config,
          cenaceUrl: 'https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm',
          opinion: { ...DEFAULT_SITE_CONFIG.opinion, ...(config.opinion || {}) },
          links: Array.isArray(config.links) && config.links.length ? config.links : DEFAULT_SITE_CONFIG.links
        });
      } catch {
        if (!cancelled) setSiteConfig(DEFAULT_SITE_CONFIG);
      }
    }
    loadSiteConfig();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOpinion() {
      try {
        const response = await fetch(siteConfig.opinion?.path || '/opinion.md');
        if (!response.ok) throw new Error('No se pudo cargar la columna de opinión.');
        const text = await response.text();
        if (!cancelled) setOpinionMarkdown(text);
      } catch {
        if (!cancelled) setOpinionMarkdown('# Columna de Opinión Técnica\n\nContenido no disponible. Edita `public/opinion.md` para publicar el artículo del mes.');
      }
    }
    loadOpinion();
    return () => { cancelled = true; };
  }, [siteConfig.opinion?.path]);

  useEffect(() => {
    async function load() {
      try {
        const [inventario, desempeno, riesgos, expansion, geografia, lluvias, mantenimiento] = await Promise.all([
          fetchJsonAsset('/data/inventario_activos.json'),
          fetchJsonAsset('/data/Desempeno_y_Balance.json'),
          fetchJsonAsset('/data/Riesgos_Vulnerabilidades_alertas.json'),
          fetchJsonAsset('/data/Plan_Expansion.json'),
          fetchJsonAsset('/data/geografia_activos.json'),
          fetchJsonAsset('/data/LLuvias.json'),
          fetchJsonAsset('/data/mantenimiento.json')
        ]);
        setData({ loading: false, error: null, inventario, desempeno, riesgos, expansion, geografia, lluvias, mantenimiento });
      } catch (error) {
        setData({ loading: false, error: error.message || 'No se pudieron cargar los datos.' });
      }
    }
    load();
  }, []);

  const model = useMemo(() => (data.inventario ? buildModel(data) : null), [data]);

  const provincias = useMemo(() => {
    if (!model) return ['Todas'];
    const set = new Set([
      ...model.geoCentrales.map((item) => item.provincia),
      ...model.geoSubestaciones.map((item) => item.provincia),
      ...model.geoObras.map((item) => item.provincia)
    ].filter(Boolean));
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [model]);

  useEffect(() => {
    if (provincias.length > 2) {
      setComparator((previous) => ({
        a: provincias.includes(previous.a) ? previous.a : provincias[1],
        b: provincias.includes(previous.b) ? previous.b : (provincias[2] || provincias[1])
      }));
    }
  }, [provincias]);

  const filtered = useMemo(() => {
    if (!model) return { centrales: [], subestaciones: [], obras: [] };
    let centrales = model.geoCentrales;
    let subestaciones = model.geoSubestaciones;
    let obras = model.geoObras;

    if (filters.provincia !== 'Todas') {
      centrales = centrales.filter((item) => item.provincia === filters.provincia);
      subestaciones = subestaciones.filter((item) => item.provincia === filters.provincia);
      obras = obras.filter((item) => item.provincia === filters.provincia);
    }

    if (filters.tipo !== 'Todos') centrales = centrales.filter((item) => item.tipo === filters.tipo);
    if (filters.soloCriticas) subestaciones = subestaciones.filter((item) => item.critica);

    return { centrales, subestaciones, obras };
  }, [model, filters]);

  const comparisonData = useMemo(() => {
    if (!model) return null;
    return {
      a: buildProvinceMetrics(model, comparator.a),
      b: buildProvinceMetrics(model, comparator.b)
    };
  }, [model, comparator]);

  const radarData = useMemo(() => {
    if (!comparisonData) return [];
    return [
      { metric: 'Efectiva MW', A: Number((comparisonData.a.effective / 20).toFixed(1)), B: Number((comparisonData.b.effective / 20).toFixed(1)) },
      { metric: 'Nominal MW', A: Number((comparisonData.a.nominal / 20).toFixed(1)), B: Number((comparisonData.b.nominal / 20).toFixed(1)) },
      { metric: 'Centrales', A: comparisonData.a.centrales, B: comparisonData.b.centrales },
      { metric: 'Subestaciones', A: comparisonData.a.subestaciones, B: comparisonData.b.subestaciones },
      { metric: 'Críticas', A: comparisonData.a.criticas, B: comparisonData.b.criticas }
    ];
  }, [comparisonData]);

  const filteredStats = useMemo(() => {
    const nominal = filtered.centrales.reduce((sum, item) => sum + Number(item.potencia_nominal_mw || 0), 0);
    const effective = filtered.centrales.reduce((sum, item) => sum + Number(item.potencia_efectiva_mw || 0), 0);
    return {
      nominal,
      effective,
      centrales: filtered.centrales.length,
      hidro: filtered.centrales.filter((item) => item.tipo === 'Hidroelectrica').reduce((sum, item) => sum + Number(item.potencia_efectiva_mw || 0), 0),
      termica: filtered.centrales.filter((item) => item.tipo === 'Termoelectrica').reduce((sum, item) => sum + Number(item.potencia_efectiva_mw || 0), 0)
    };
  }, [filtered]);

  const maintenanceCandidates = useMemo(() => {
    if (!model) return [];
    return model.geoCentrales
      .filter((item) => Number(item.potencia_efectiva_mw || 0) > 0)
      .sort((a, b) => Number(b.potencia_efectiva_mw || 0) - Number(a.potencia_efectiva_mw || 0))
      .map((item) => ({
        id: item.id_activo,
        nombre: item.nombre,
        tipo: item.tipo,
        provincia: item.provincia,
        impacto_mw: Number(item.potencia_efectiva_mw || 0),
        criterio: 'Salida simulada de central principal'
      }));
  }, [model]);

  const simulationResult = useMemo(() => {
    if (!model) return null;
    const rainFactor = Math.min(Math.max(simulation.rainPct, 0), 100) / 100;
    const activeMaintenance = maintenanceCandidates.filter((item) => simulation.maintenanceIds.includes(item.id));
    const hydroMaintenanceImpact = activeMaintenance
      .filter((item) => item.tipo === 'Hidroelectrica')
      .reduce((sum, item) => sum + Number(item.impacto_mw || 0), 0);
    const thermalMaintenanceImpact = activeMaintenance
      .filter((item) => item.tipo === 'Termoelectrica')
      .reduce((sum, item) => sum + Number(item.impacto_mw || 0), 0);
    const hydroFirmBase = Math.max(0, HYDRO_EFFECTIVE_BASE_MW - hydroMaintenanceImpact);
    const thermalFirmBase = Math.max(0, THERMAL_EFFECTIVE_BASE_MW - thermalMaintenanceImpact);
    const hydroAvailable = hydroFirmBase * rainFactor;
    const thermalAvailable = thermalFirmBase;
    const autogenShare = Math.min(Math.max(simulation.autogenPct, 0), 100) / 100;
    const colombiaMw = Math.min(Math.max(simulation.colombiaMw, 0), 450);
    const autogenAvailable = model.groups.autogenEffective * autogenShare;
    const firmImport = colombiaMw;
    const totalAvailable = hydroAvailable + thermalAvailable + autogenAvailable + firmImport;
    const projectedPeakDemand = DEMAND_MAX_MW;
    const operatingReserve = SECURITY_RESERVE_MW;
    const adequacyRequirement = SUFFICIENCY_REQUIREMENT_MW;
    const balanceMW = totalAvailable - adequacyRequirement;
    const deficitMW = Math.max(0, -balanceMW);
    const rainPressure = Math.max(0, (100 - Math.min(simulation.rainPct, 100)) / 100);
    const maintenanceImpact = hydroMaintenanceImpact + thermalMaintenanceImpact;
    const maintenancePressure = Math.min(1, maintenanceImpact / adequacyRequirement);
    const importBackupPressure = (1 - (firmImport / 450)) * CENACE_RISK_CEILING * 0.06;
    const autogenBackupPressure = (1 - autogenShare) * CENACE_RISK_CEILING * 0.08;
    const outageProbability = CENACE_RISK_CEILING;
    const openFragility = Math.max(0, Math.min(100, (deficitMW / OPEN_MODEL_STRESS_DEFICIT_MW) * 100));
    return {
      rainFactor,
      activeMaintenance,
      hydroMaintenanceImpact,
      thermalMaintenanceImpact,
      hydroFirmBase,
      thermalFirmBase,
      hydroAvailable,
      thermalAvailable,
      autogenAvailable,
      autogenShare,
      maintenanceImpact,
      firmGenerationAvailable: totalAvailable,
      firmImport,
      totalAvailable,
      projectedPeakDemand,
      operatingReserve,
      adequacyRequirement,
      balanceMW,
      deficitMW,
      outageProbability,
      openFragility,
      openModelReferenceDeficit: OPEN_MODEL_STRESS_DEFICIT_MW,
      probabilityFactors: {
        techo_cenace: CENACE_RISK_CEILING,
        brecha_suficiencia: Math.max(0, deficitMW / adequacyRequirement) * CENACE_RISK_CEILING * 0.64,
        presion_hidrologica: rainPressure * CENACE_RISK_CEILING * 0.24,
        presion_mantenimiento: maintenancePressure * CENACE_RISK_CEILING * 0.12,
        autogeneracion_no_utilizada: autogenBackupPressure,
        falta_importacion_firme: importBackupPressure
      },
      status: balanceMW < 0 ? 'Déficit simulado' : 'Cobertura simulada'
    };
  }, [model, simulation, maintenanceCandidates]);

  const activeSummary = useMemo(() => {
    if (!model) return [];
    return [
      { nombre: 'Hidro principales', assetClass: 'Grupo agregado', potencia_nominal_mw: model.groups.hydroMainNominal, potencia_efectiva_mw: model.groups.hydroMainEffective, notas: 'Suma de hidroeléctricas prioritarias individualizadas en el inventario.' },
      { nombre: 'Otras hidro', assetClass: 'Grupo agregado', potencia_nominal_mw: model.groups.hydroOtherNominal, potencia_efectiva_mw: model.groups.hydroOtherEffective, notas: 'Bloque agregado de otras centrales hídricas del S.N.I.' },
      { nombre: 'Autogeneración', assetClass: 'Grupo agregado fuera del S.N.I.', potencia_nominal_mw: model.groups.autogenNominal, potencia_efectiva_mw: model.groups.autogenEffective, notas: 'Capacidad correspondiente principalmente a sectores industriales y petroleros.' }
    ];
  }, [model]);

  if (data.loading) return <div className="state-screen">Cargando observatorio...</div>;
  if (data.error || !model) return <div className="state-screen error">Error: {data.error || 'No se pudo construir el modelo.'}</div>;

  const nearCritical = model.geoSubestaciones.filter((item) => item.cargabilidad_actual_porcentaje == null);
  const investment = Object.fromEntries(model.investmentByActivity.map((item) => [item.actividad, item.monto]));
  const criticalSource = model.raw.capaRiesgo.alertas_infraestructura_critica;
  const oriental = model.hidrologia?.clasificacion_cuencas.vertiente_oriental_amazonica;
  const occidental = model.hidrologia?.clasificacion_cuencas.vertiente_occidental_pacifico;
  const toggleSimulationMaintenance = (id) => {
    setSimulation((state) => ({
      ...state,
      maintenanceIds: state.maintenanceIds.includes(id)
        ? state.maintenanceIds.filter((item) => item !== id)
        : [...state.maintenanceIds, id]
    }));
  };
  const toggleProbabilityHelp = (key) => {
    setActiveProbabilityHelp((current) => (current === key ? null : key));
  };

  const exportFullObservatoryPdf = async () => {
    if (!exportAreaRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    const previousTab = activeTab;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const tabsToCapture = ['inicio', ...TABS.filter((tab) => tab.key !== 'inicio').map((tab) => tab.key)];
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const outerMargin = 36;
    const contentTop = 92;
    const contentBottom = 54;
    const reportDate = new Date();
    const dateLabel = reportDate.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: '2-digit'
    });
    const fileDate = reportDate.toISOString().slice(0, 10);
    const safeFileName = `observatorio-electrico-reporte-${fileDate}`;

    const waitForPaint = () => new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 90);
        });
      });
    });

    const captureNodeToCanvas = async (node) => {
      const wrapper = document.createElement('div');
      const clone = node.cloneNode(true);
      const width = Math.ceil(node.getBoundingClientRect().width || node.clientWidth || pageWidth - outerMargin * 2);
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-10000px';
      wrapper.style.top = '0';
      wrapper.style.width = `${width}px`;
      wrapper.style.background = '#07111f';
      wrapper.style.padding = '0';
      wrapper.style.margin = '0';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.zIndex = '-1';

      clone.style.width = `${width}px`;
      clone.style.height = 'auto';
      clone.style.minHeight = '0';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.margin = '0';
      clone.style.borderRadius = '0';
      clone.style.boxShadow = 'none';
      clone.style.transform = 'none';

      const topbar = clone.querySelector('.topbar');
      if (topbar) topbar.remove();

      const floatingBackdrops = clone.querySelectorAll('.modal-backdrop, .tooltip, .leaflet-control-container');
      floatingBackdrops.forEach((element) => element.remove());

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      try {
        if (document.fonts?.ready) await document.fonts.ready;
        return await html2canvas(clone, {
          backgroundColor: '#07111f',
          scale: 1.65,
          useCORS: true,
          logging: false,
          width,
          windowWidth: width,
          scrollX: 0,
          scrollY: 0
        });
      } finally {
        wrapper.remove();
      }
    };

    const addPageTitle = (title, pageIndex) => {
      pdf.setFillColor(8, 17, 31);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      pdf.setDrawColor(59, 130, 246);
      pdf.setLineWidth(1);
      pdf.line(36, 68, pageWidth - 36, 68);
      pdf.setTextColor(229, 237, 247);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(17);
      if (title) pdf.text(title, outerMargin, 46);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      if (pageIndex > 1 || title) pdf.text(siteConfig.title, pageWidth - outerMargin, 46, { align: 'right' });
    };

    const addImageCentered = (canvas) => {
      const availableWidth = pageWidth - outerMargin * 2;
      const availableHeight = pageHeight - contentTop - contentBottom;
      const ratio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = contentTop + (availableHeight - imgHeight) / 2;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgWidth, imgHeight);
    };

    try {
      const cover = document.createElement('div');
      cover.style.width = '794px';
      cover.style.height = '1123px';
      cover.style.boxSizing = 'border-box';
      cover.style.padding = '72px 64px';
      cover.style.display = 'flex';
      cover.style.flexDirection = 'column';
      cover.style.alignItems = 'center';
      cover.style.justifyContent = 'center';
      cover.style.gap = '18px';
      cover.style.background = 'linear-gradient(180deg, #07111f 0%, #0b1728 100%)';
      cover.style.color = '#e5edf7';
      cover.style.textAlign = 'center';
      cover.innerHTML = `
        <img src="/ote-horizontal.svg" alt="Observatorio Eléctrico del Ecuador" style="width: 250px; max-width: 72%; height: auto; object-fit: contain;" />
        <div style="display:grid; gap:12px; max-width: 560px;">
          <div style="font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; color:#93c5fd; font-weight: 800;">Reporte institucional</div>
          <h1 style="margin:0; font-size: 31px; line-height: 1.12; font-weight: 900;">Reporte del Observatorio Eléctrico del Ecuador</h1>
          <div style="font-size: 16px; color:#dbeafe; font-weight: 700;">Generado al ${dateLabel}</div>
          <p style="margin:0; font-size: 16px; line-height: 1.7; color:#cbd5e1;">Reporte automático generado desde el Observatorio Técnico Eléctrico.</p>
          <p style="margin:0; font-size: 13px; line-height: 1.7; color:#94a3b8;">Fuente: Plan Maestro de Electricidad del Ecuador, CENACE y fuentes internas cargadas en public/data.</p>
        </div>
      `;
      cover.style.position = 'fixed';
      cover.style.left = '-10000px';
      cover.style.top = '0';
      document.body.appendChild(cover);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => {
        const img = cover.querySelector('img');
        if (!img) return resolve();
        if (img.complete) return resolve();
        img.onload = resolve;
        img.onerror = resolve;
      });
      const coverCanvas = await html2canvas(cover, {
        backgroundColor: '#07111f',
        scale: 1.6,
        useCORS: true,
        logging: false,
        width: 794,
        height: 1123
      });
      cover.remove();
      pdf.addImage(coverCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);

      for (let index = 0; index < tabsToCapture.length; index += 1) {
        const tabKey = tabsToCapture[index];
        setActiveTab(tabKey);
        await waitForPaint();
        const canvas = await captureNodeToCanvas(exportAreaRef.current);
        pdf.addPage();
        addPageTitle(TABS.find((tab) => tab.key === tabKey)?.label || tabKey, index + 2);
        addImageCentered(canvas);
      }

      const totalPages = pdf.getNumberOfPages();
      for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
        pdf.setPage(pageIndex);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`Página ${pageIndex} de ${totalPages}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
      }

      pdf.save(`${safeFileName}.pdf`);
    } finally {
      setActiveTab(previousTab);
      setIsExportingPdf(false);
    }
  };

  return (
    <div className={`app-shell ${activeTab !== 'centrales' ? 'full-shell' : ''}`}>
      {activeTab === 'centrales' ? (
      <aside className="sidebar">
        <div className="brand-block">
          <span className="eyebrow">Sistema de análisis histórico-estructural</span>
          <h1>{siteConfig.title}</h1>
          <p>Capacidad instalada y efectiva, balance 2025, red crítica, expansión e inversión del sistema eléctrico ecuatoriano con base en los JSON del proyecto.</p>
        </div>

        <Panel title="Filtros persistentes" subtitle="Se mantienen entre pestañas y recargas.">
          <div className="filter-grid">
            <label>
              <span>Provincia</span>
              <select value={filters.provincia} onChange={(event) => setFilters((state) => ({ ...state, provincia: event.target.value }))}>
                {provincias.map((provincia) => <option key={provincia}>{provincia}</option>)}
              </select>
            </label>
            <label>
              <span>Tecnología</span>
              <select value={filters.tipo} onChange={(event) => setFilters((state) => ({ ...state, tipo: event.target.value }))}>
                {['Todos', 'Hidroelectrica', 'Termoelectrica'].map((tipo) => <option key={tipo}>{tipo}</option>)}
              </select>
            </label>
          </div>
          <div className="toggle-group">
            <label><input type="checkbox" checked={filters.soloCriticas} onChange={(event) => setFilters((state) => ({ ...state, soloCriticas: event.target.checked }))} /> Solo subestaciones críticas</label>
            <label><input type="checkbox" checked={filters.showCentrales} onChange={(event) => setFilters((state) => ({ ...state, showCentrales: event.target.checked }))} /> Mostrar centrales</label>
            <label><input type="checkbox" checked={filters.showSubestaciones} onChange={(event) => setFilters((state) => ({ ...state, showSubestaciones: event.target.checked }))} /> Mostrar subestaciones</label>
            <label><input type="checkbox" checked={filters.showObras} onChange={(event) => setFilters((state) => ({ ...state, showObras: event.target.checked }))} /> Mostrar obras prioritarias</label>
          </div>
        </Panel>

        <Panel title="Lectura nacional" subtitle="Totales estructurales del inventario.">
          <div className="mini-metrics">
            <div><span>Nominal S.N.I.</span><strong>{mw(model.kpis.nominalTotal)}</strong></div>
            <div><span>Efectiva S.N.I.</span><strong>{mw(model.kpis.efectivaTotal)}</strong></div>
            <div><span>Carga actual del sistema</span><strong>{mw(DEMAND_MAX_MW)}</strong></div>
            <div><span>Reserva de seguridad</span><strong>{mw(SECURITY_RESERVE_MW)}</strong></div>
            <div><span>Autogeneración efectiva</span><strong>{mw(model.groups.autogenEffective)}</strong></div>
            <div><span>Balance oferta-demanda estructural</span><strong>{mw(model.kpis.deficitMW)}</strong></div>
          </div>
          <div className="source-note">Lectura de balance: oferta total simulada menos demanda de suficiencia. Cuando la oferta no alcanza el punto de equilibrio, el resultado se muestra como déficit negativo.</div>
        </Panel>

      </aside>
      ) : null}

      <main className={`main-content ${tabThemeClass}`} ref={exportAreaRef}>
        <section className="topbar">
          <div className="tabs-strip">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}><Icon size={16} /> {tab.label}</button>;
            })}
          </div>
          <div className="topbar-actions">
            <div className="topbar-chip">{activeTab === 'centrales' ? `Filtros activos: ${filters.provincia} · ${filters.tipo}` : ''}</div>
            {activeTab === 'centrales' ? (
              <a className="topbar-btn external" href="https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm" target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> CENACE
              </a>
            ) : null}
            {activeTab !== 'centrales' && activeTab !== 'inicio' ? (
              <>
                <button className="topbar-btn" onClick={() => makeExecutivePdf(model, filters, comparisonData.a, comparisonData.b, simulation, simulationResult)}>
                  <FileDown size={16} /> PDF
                </button>
                <button className="topbar-btn" onClick={() => downloadExecutiveJson(model, filters, comparisonData.a, comparisonData.b, simulation, simulationResult)}>
                  <FileDown size={16} /> JSON
                </button>
              </>
            ) : null}
          </div>
        </section>

        {activeTab === 'inicio' ? (
          <HomePageEntry
            siteConfig={siteConfig}
            opinionMarkdown={opinionMarkdown}
            onExportPdf={exportFullObservatoryPdf}
            onExportJson={() => downloadExecutiveJson(model, filters, comparisonData.a, comparisonData.b, simulation, simulationResult)}
            isExportingPdf={isExportingPdf}
            onNavigateTab={setActiveTab}
            showOpinionFull={showOpinionFull}
            onToggleOpinionFull={setShowOpinionFull}
          />
        ) : null}

        {activeTab !== 'inicio' ? (
        <section className="hero-grid">
          <KpiCard icon={BatteryCharging} label="Capacidad nominal S.N.I." value={mw(model.kpis.nominalTotal)} note="Inventario oficial" />
          <KpiCard icon={Bolt} label="Capacidad efectiva S.N.I." value={mw(model.kpis.efectivaTotal)} note={`Disponibilidad ${pct(model.kpis.disponibilidad)}`} tone="green" />
          <KpiCard icon={TrendingUp} label="Carga actual del sistema" value={mw(DEMAND_MAX_MW)} note="Demanda máxima proyectada" tone="amber" />
          <KpiCard icon={Droplets} label="Reserva de seguridad" value={mw(SECURITY_RESERVE_MW)} note="10% del punto de equilibrio" tone="green" />
          <KpiCard icon={Zap} label="Autogeneración efectiva" value={mw(model.groups.autogenEffective)} note="Fuera del S.N.I." tone="violet" />
          <KpiCard icon={ShieldAlert} label="Balance oferta-demanda" value={mw(model.kpis.deficitMW)} note="Oferta total menos demanda de suficiencia" tone="red" />
          <KpiCard icon={Droplets} label="Renovable 2025" value={pct(model.kpis.renovablePct)} note="Participación anual" tone="green" />
          <KpiCard icon={TrendingUp} label="Inversión PME" value={musd(model.kpis.totalInversion)} note="Plan 2023-2032" tone="amber" />
        </section>
        ) : null}

        {activeTab === 'centrales' ? (
          <>
            <section className="layout-map">
              <Panel title="Mapa de centrales" subtitle="Centrales georreferenciadas del JSON geográfico, con mapa centrado y restringido a Ecuador." actions={<span className="panel-chip">{filtered.centrales.length} centrales visibles</span>}>
                <div className="map-wrap large">
                  <MapLegend />
                  <MapContainer center={[-1.65, -78.6]} zoom={6.4} minZoom={6} maxZoom={9} maxBounds={ECUADOR_BOUNDS} maxBoundsViscosity={1.0} scrollWheelZoom className="leaflet-map">
                    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap bounds={ECUADOR_BOUNDS} />
                    {filters.showCentrales && filtered.centrales.map((central) => (
                      <CircleMarker key={central.id_activo} center={[central.lat, central.lng]} radius={central.tipo === 'Hidroelectrica' ? 8 : 7} pathOptions={{ color: central.tipo === 'Hidroelectrica' ? '#38bdf8' : '#f59e0b', fillColor: central.tipo === 'Hidroelectrica' ? '#38bdf8' : '#f59e0b', fillOpacity: 0.9 }} eventHandlers={{ click: () => setSelectedAsset({ ...central, assetClass: 'Central' }) }}>
                        <Popup><div className="popup-block"><strong>{central.nombre}</strong><div>{central.tipo} · {central.subtipo}</div><div>{central.provincia} · {central.canton}</div><div>Potencia efectiva: {mw(central.potencia_efectiva_mw)}</div><button className="link-btn" onClick={() => setSelectedAsset({ ...central, assetClass: 'Central' })}>Abrir ficha técnica</button></div></Popup>
                      </CircleMarker>
                    ))}
                    {filters.showSubestaciones && filtered.subestaciones.map((subestacion) => (
                      <CircleMarker key={subestacion.id_activo} center={[subestacion.lat, subestacion.lng]} radius={8} pathOptions={{ color: subestacion.critica ? '#ef4444' : '#a78bfa', fillColor: subestacion.critica ? '#ef4444' : '#a78bfa', fillOpacity: 0.85 }} eventHandlers={{ click: () => setSelectedAsset({ ...subestacion, assetClass: 'Subestación' }) }}>
                        <Popup><div className="popup-block"><strong>{subestacion.nombre}</strong><div>{subestacion.provincia} · {subestacion.canton}</div><div>Cargabilidad: {subestacion.cargabilidad_actual_porcentaje != null ? pct(subestacion.cargabilidad_actual_porcentaje) : subestacion.detalle_cargabilidad}</div><button className="link-btn" onClick={() => setSelectedAsset({ ...subestacion, assetClass: 'Subestación' })}>Abrir ficha técnica</button></div></Popup>
                      </CircleMarker>
                    ))}
                    {filters.showObras && filtered.obras.map((obra, index) => (
                      <CircleMarker key={`${obra.nombre}-${index}`} center={[obra.lat, obra.lng]} radius={7} pathOptions={{ color: '#fb7185', fillColor: '#fb7185', fillOpacity: 0.85 }} eventHandlers={{ click: () => setSelectedAsset({ ...obra, assetClass: 'Obra prioritaria' }) }}>
                        <Popup><div className="popup-block"><strong>{obra.nombre}</strong><div>{obra.categoria}</div><div>{obra.estado}</div><button className="link-btn" onClick={() => setSelectedAsset({ ...obra, assetClass: 'Obra prioritaria' })}>Abrir ficha técnica</button></div></Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              </Panel>

              <div className="stack-panels">
                <Panel title="Composición del parque" subtitle="S.N.I. separado de autogeneración.">
                  <div className="summary-header"><span>Grupo</span><span>Nominal</span><span>Efectiva</span></div>
                  <SummaryRow label="Hidro principales" nominal={model.groups.hydroMainNominal} effective={model.groups.hydroMainEffective} onClick={() => setSelectedAsset(activeSummary[0])} />
                  <SummaryRow label="Otras hidro" nominal={model.groups.hydroOtherNominal} effective={model.groups.hydroOtherEffective} onClick={() => setSelectedAsset(activeSummary[1])} />
                  <SummaryRow label="Total hidro S.N.I." nominal={model.groups.hydroTotalNominal} effective={model.groups.hydroTotalEffective} emphasize />
                  <SummaryRow label="Total térmico S.N.I." nominal={model.groups.thermalTotalNominal} effective={model.groups.thermalTotalEffective} emphasize />
                  <SummaryRow label="Total S.N.I." nominal={model.kpis.nominalTotal} effective={model.kpis.efectivaTotal} emphasize />
                  <SummaryRow label="Autogeneración" nominal={model.groups.autogenNominal} effective={model.groups.autogenEffective} onClick={() => setSelectedAsset(activeSummary[2])} />
                  <div className="subpanel thermal-subpanel">
                    <div className="subpanel-header">
                      <h3>Parque térmico desglosado</h3>
                      <p>Los activos térmicos se muestran uno por uno para dejar visible el respaldo efectivo de 2.145 MW.</p>
                    </div>
                    <DataTable
                      columns={[
                        { key: 'nombre', label: 'Activo' },
                        { key: 'grupo', label: 'Grupo' },
                        { key: 'potencia_efectiva_mw', label: 'Efectiva', render: (row) => mw(row.potencia_efectiva_mw) }
                      ]}
                      rows={model.thermalAssetRows}
                    />
                  </div>
                </Panel>

                <Panel title="Lectura técnica" subtitle="Primera lectura estructural del sistema.">
                  <div className="insight-box">
                    <p>El parque mantiene alta concentración hidroeléctrica: {pct((model.groups.hydroTotalEffective / model.kpis.efectivaTotal) * 100)} de la potencia efectiva del S.N.I. está en hidro.</p>
                    <p>La capacidad térmica efectiva representa {pct((model.groups.thermalTotalEffective / model.kpis.efectivaTotal) * 100)} del S.N.I. y funciona como soporte estructural.</p>
                    <p>La autogeneración se muestra separada porque no forma parte del total S.N.I.; su potencia efectiva es {mw(model.groups.autogenEffective)}.</p>
                  </div>
                </Panel>
              </div>
            </section>

            <section className="grid-two">
              <Panel title="Comparador provincial" subtitle="Contrasta activos visibles y criticidad entre dos provincias.">
                <div className="comparator-controls">
                  <label><span>Provincia A</span><select value={comparator.a} onChange={(event) => setComparator((state) => ({ ...state, a: event.target.value }))}>{provincias.filter((provincia) => provincia !== 'Todas').map((provincia) => <option key={provincia}>{provincia}</option>)}</select></label>
                  <label><span>Provincia B</span><select value={comparator.b} onChange={(event) => setComparator((state) => ({ ...state, b: event.target.value }))}>{provincias.filter((provincia) => provincia !== 'Todas').map((provincia) => <option key={provincia}>{provincia}</option>)}</select></label>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(148, 163, 184, 0.25)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Radar name={comparisonData.a.province} dataKey="A" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.18} />
                      <Radar name={comparisonData.b.province} dataKey="B" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Activos técnicos" subtitle="Haz clic en una fila para abrir la ficha técnica.">
                <div className="mini-metrics inline">
                  <div><span>Nominal visible</span><strong>{mw(filteredStats.nominal)}</strong></div>
                  <div><span>Efectiva visible</span><strong>{mw(filteredStats.effective)}</strong></div>
                  <div><span>Hidro visible</span><strong>{mw(filteredStats.hidro)}</strong></div>
                  <div><span>Térmica visible</span><strong>{mw(filteredStats.termica)}</strong></div>
                </div>
                <DataTable
                  columns={[
                    { key: 'nombre', label: 'Activo' },
                    { key: 'tipo', label: 'Tipo' },
                    { key: 'provincia', label: 'Provincia' },
                    { key: 'potencia_efectiva_mw', label: 'Efectiva', render: (row) => mw(row.potencia_efectiva_mw) }
                  ]}
                  rows={filtered.centrales}
                  onRowClick={(row) => setSelectedAsset({ ...row, assetClass: 'Central' })}
                />
              </Panel>
            </section>
          </>
        ) : null}

        {activeTab === 'balance' ? (
          <>
            <section className="methodology-bar">
              <div>
                <strong>Balance oferta-demanda estructural documentado con criterio CENACE</strong>
                <span>Fórmula de suficiencia, consistencia con fuentes oficiales y techo de riesgo del 25%.</span>
              </div>
              <button className="methodology-toggle" type="button" onClick={() => setShowBalanceMethodology((value) => !value)}>
                {showBalanceMethodology ? 'Ocultar metodología' : 'Ver metodología'}
              </button>
            </section>

            <section className="grid-two balance-layout">
              <Panel title="Flujo Energético Nacional 2025 (GWh)" subtitle="Generación + importaciones → pérdidas → exportaciones → demanda atendida" className="wide-panel">
                <EnergyFlow model={model} />
              </Panel>

              <Panel title="Balance oferta-demanda estructural" subtitle="Riesgo de oferta-demanda en el horizonte 2026-2027.">
                <div className="deficit-card">
                  <span>Balance oferta-demanda</span>
                  <strong>{mw(model.kpis.deficitMW)}</strong>
                  <p>Dato de la capa de vulnerabilidad; no corresponde a operación en tiempo real. El signo del balance se interpreta como oferta menos demanda.</p>
                </div>
              </Panel>
            </section>

            <section className="grid-two">
              <Panel title="Matriz 2025 simplificada" subtitle="Porcentaje calculado respecto de la generación bruta total 2025.">
                <div className="chart-wrap">
                  <ResponsiveContainer>
                    <BarChart data={model.simplifiedMix} layout="vertical" margin={{ top: 10, right: 28, bottom: 10, left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                      <XAxis type="number" tick={{ fill: '#94a3b8' }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#e2e8f0', fontSize: 12 }} width={110} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value, name, props) => [gwh(value), `${props.payload.name} (${pct(props.payload.pct)})`]} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                        {model.simplifiedMix.map((_, index) => <Cell key={index} fill={COLORS[index]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <DataTable
                  columns={[
                    { key: 'name', label: 'Otras renovables' },
                    { key: 'value', label: 'GWh', render: (row) => gwh(row.value) },
                    { key: 'pct', label: '% generación', render: (row) => pct(row.pct) }
                  ]}
                  rows={model.otherRenewableRows}
                />
              </Panel>

              <Panel title="Pérdidas" subtitle="Distribución anual de pérdidas en distribución.">
                <div className="loss-grid">
                  <div className="chart-wrap donut">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={model.lossesBreakdown} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="78%" paddingAngle={3}>
                          {model.lossesBreakdown.map((_, index) => <Cell key={index} fill={['#38bdf8', '#ef4444'][index]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => gwh(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mini-metrics">
                    <div><span>Total distribución</span><strong>{gwh(model.kpis.distributionLossGwh)}</strong></div>
                    <div><span>Porcentaje total</span><strong>{pct(model.kpis.distributionLossPct)}</strong></div>
                    <div><span>Técnicas</span><strong>{gwh(model.lossesBreakdown[0].value)}</strong></div>
                    <div><span>No técnicas</span><strong>{gwh(model.lossesBreakdown[1].value)}</strong></div>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: 'name', label: 'Tipo' },
                    { key: 'value', label: 'GWh', render: (row) => gwh(row.value) },
                    { key: 'pct', label: '% distribución', render: (row) => pct(row.pct) }
                  ]}
                  rows={model.lossesBreakdown}
                />
                <div className="insight-box compact">Las pérdidas en distribución superan ampliamente las pérdidas en transmisión.</div>
              </Panel>
            </section>

            <Panel title="Insight técnico automático" subtitle="Texto calculado con los valores de los JSON cargados.">
              <div className="insight-grid">
                <div>Alta dependencia hidráulica: {gwh(model.simplifiedMix[0].value)} de generación hidráulica, equivalente a {pct(model.simplifiedMix[0].pct)} de la generación bruta 2025.</div>
                <div>Las pérdidas de distribución ({gwh(model.kpis.distributionLossGwh)}) son {fmt.format(model.kpis.distributionLossGwh / model.kpis.transmissionLossGwh)} veces las pérdidas de transmisión ({gwh(model.kpis.transmissionLossGwh)}).</div>
                <div>La capa de vulnerabilidad identifica un balance oferta-demanda estructural planificado de {mw(model.kpis.deficitMW)} para el horizonte 2026-2027; en simulación, el balance se lee como oferta menos demanda.</div>
              </div>
            </Panel>

            {showBalanceMethodology ? (
            <>
            <section className="grid-two">
              <Panel title="Consistencia con fuentes oficiales" subtitle="Lectura documental del balance oferta-demanda y de los indicadores que lo rodean.">
                <div className="mini-metrics inline">
                  <div><span>Carga actual del sistema</span><strong>{mw(DEMAND_MAX_MW)}</strong></div>
                  <div><span>Reserva de seguridad</span><strong>{mw(SECURITY_RESERVE_MW)}</strong></div>
                  <div><span>Oferta total simulada</span><strong>{mw(simulationResult.totalAvailable)}</strong></div>
                  <div><span>Balance oferta-demanda</span><strong>{mw(simulationResult.balanceMW)}</strong></div>
                </div>
                <DataTable
                  columns={[
                    { key: 'indicador', label: 'Indicador' },
                    { key: 'valor', label: 'Valor del observatorio' },
                    { key: 'criterio', label: 'Consistencia' }
                  ]}
                  rows={[
                    { id: 'capacidad', indicador: 'Capacidad instalada y efectiva S.N.I.', valor: `${mw(model.kpis.nominalTotal)} nominales / ${mw(model.kpis.efectivaTotal)} efectivos`, criterio: 'Consistente con Tabla Nro. 4 de la Estadística 2025.' },
                    { id: 'demanda', indicador: 'Carga actual del sistema', valor: mw(DEMAND_MAX_MW), criterio: 'Demanda máxima proyectada visible para justificar la oferta simulada.' },
                    { id: 'reserva', indicador: 'Reserva de seguridad', valor: mw(SECURITY_RESERVE_MW), criterio: 'Margen operativo de 10% incorporado al punto de equilibrio.' },
                    { id: 'deficit', indicador: 'Balance oferta-demanda estiaje 2025-2026', valor: mw(model.kpis.deficitMW), criterio: 'Coincide con Circular CENACE-2026-0005-C.' },
                    { id: 'perdidas', indicador: 'Pérdidas en distribución', valor: pct(model.kpis.distributionLossPct), criterio: 'Consistente con Estadística 2025.' },
                    { id: 'subestaciones', indicador: 'Subestaciones sobre capacidad nominal', valor: 'Nueva Babahoyo, Pascuales (ATQ), Santa Elena (ATR)', criterio: 'Respaldado por registros operativos incluidos en la capa de vulnerabilidad.' }
                  ]}
                />
                <div className="source-note">La probabilidad de apagones del simulador queda acotada al máximo estructural oficial de {model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.vulnerabilidad_estructural_global}. El balance operativo se interpreta como oferta total simulada menos demanda del sistema; cuando el resultado es negativo, hay déficit.</div>
              </Panel>

              <Panel title="Criterio CENACE para calcular déficit" subtitle="El balance se expresa como oferta total simulada menos punto de equilibrio.">
                <div className="formula-box">
                  <strong>Déficit = Oferta total simulada - Punto de equilibrio</strong>
                </div>
                <div className="mini-metrics result-metrics">
                  <div><span>Reserva operativa</span><strong>10%</strong></div>
                  <div><span>Generación firme</span><strong>Potencia efectiva ajustada por indisponibilidad técnica</strong></div>
                  <div><span>Déficit reportado</span><strong>{mw(model.kpis.deficitMW)}</strong></div>
                  <div><span>Criterio de confiabilidad</span><strong>90% de probabilidad de excedencia hídrica</strong></div>
                </div>
                <div className="insight-box compact">CENACE calcula el déficit actual a partir del requerimiento total y la capacidad nueva o recuperada; en la lectura del observatorio, el signo final sale de restar la demanda al total de oferta simulada.</div>
              </Panel>
            </section>

            <Panel title="Interpretación oficial del límite del 25%" subtitle="Riesgo estructural del S.N.I. para el horizonte 2026-2027, no certeza de apagón.">
              <div className="risk-period-grid">
                <div><span>Enero-marzo 2026</span><strong>{model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.inicio_2026}</strong><p>Probabilidad durante el estiaje inicial del horizonte.</p></div>
                <div><span>Octubre 2026-marzo 2027</span><strong>{model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.octubre_2026_marzo_2027}</strong><p>Periodo con mayor riesgo identificado en los datos disponibles.</p></div>
                <div><span>Vulnerabilidad estructural global</span><strong>{model.raw.capaRiesgo.balance_oferta_demanda_riesgo.probabilidad_deficit_energia.vulnerabilidad_estructural_global}</strong><p>Máximo estructural del horizonte de planificación.</p></div>
              </div>
              <div className="insight-grid">
                <div>Operación autónoma: el riesgo mide la posibilidad de que generación local hidráulica y térmica no cubra la demanda sin respaldo firme externo.</div>
                <div>Metodología oficial: la probabilidad proviene de modelación estocástica mensual de caudales y percentiles de energía no suministrada, no de una fórmula lineal.</div>
                <div>Valoración económica: CENS de {fmt.format(model.raw.capaRiesgo.balance_oferta_demanda_riesgo.costo_energia_no_suministrada_cens_usd_cent_kwh)} USD c/kWh; impacto esperado {musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_estimado_percentil_50)} y sequía extrema P98 {musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_sequia_extrema_percentil_98)}.</div>
              </div>
            </Panel>
            </>
            ) : null}
          </>
        ) : null}

        {activeTab === 'subestaciones' ? (
          <section className="grid-two">
            <div className="stack-panels">
              <Panel title="Subestaciones críticas" subtitle="Cuellos de botella de red: no generan energía; son nodos críticos de transformación y entrega.">
                <div className="risk-card-grid">
                  {model.geoSubestaciones.map((subestacion) => (
                    <button type="button" className={`risk-card ${subestacion.critica ? 'critical' : ''}`} key={subestacion.id_activo} onClick={() => setSelectedAsset({ ...subestacion, assetClass: 'Subestación' })}>
                      <div className="risk-card-top"><h3>{subestacion.nombre}</h3><RiskBadge severity={subestacion.critica ? 'Crítica' : 'Alta'} /></div>
                      <p>{subestacion.provincia} · {subestacion.nivel_kv}</p>
                      <strong>{subestacion.cargabilidad_actual_porcentaje != null ? pct(subestacion.cargabilidad_actual_porcentaje) : subestacion.detalle_cargabilidad}</strong>
                    </button>
                  ))}
                </div>
                {nearCritical.length ? <div className="source-note">La fuente indica que Manta, Quevedo, Chone y Posorja operan cercanas al 100%. Solo Posorja tiene georreferencia en el JSON geográfico; el valor exacto no está detallado en la fuente.</div> : null}
              </Panel>

              <Panel title="Obras prioritarias urgentes" subtitle="Textos reales de la capa de vulnerabilidad.">
                <ul className="priority-list">
                  {model.obrasUrgentes.map((obra) => <li key={obra}>{obra}</li>)}
                </ul>
              </Panel>
            </div>

            <div className="stack-panels">
              <Panel title="Mapa de subestaciones críticas" subtitle="Subestaciones georreferenciadas en Ecuador.">
                <div className="map-wrap medium">
                  <MapContainer center={[-1.75, -79.2]} zoom={6.4} minZoom={6} maxZoom={9} maxBounds={ECUADOR_BOUNDS} maxBoundsViscosity={1.0} scrollWheelZoom className="leaflet-map">
                    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap bounds={ECUADOR_BOUNDS} />
                    {model.geoSubestaciones.map((subestacion) => (
                      <CircleMarker key={subestacion.id_activo} center={[subestacion.lat, subestacion.lng]} radius={9} pathOptions={{ color: subestacion.critica ? '#ef4444' : '#f59e0b', fillColor: subestacion.critica ? '#ef4444' : '#f59e0b', fillOpacity: 0.92 }} eventHandlers={{ click: () => setSelectedAsset({ ...subestacion, assetClass: 'Subestación' }) }}>
                        <Popup><div className="popup-block"><strong>{subestacion.nombre}</strong><div>{subestacion.cargabilidad_actual_porcentaje != null ? pct(subestacion.cargabilidad_actual_porcentaje) : subestacion.detalle_cargabilidad}</div></div></Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              </Panel>

              <Panel title="Ranking técnico de riesgo" subtitle="Incluye subestaciones, déficit del sistema y activos sensibles.">
                <DataTable
                  columns={[
                    { key: 'nombre', label: 'Activo' },
                    { key: 'tipo', label: 'Tipo' },
                    { key: 'provincia', label: 'Provincia' },
                    { key: 'indicador', label: 'Indicador', render: (row) => row.detalle || `${fmt.format(row.indicador)} ${row.unidad}` },
                    { key: 'severidad', label: 'Severidad', render: (row) => <RiskBadge severity={row.severidad} /> }
                  ]}
                  rows={model.riskRanking}
                  onRowClick={(row) => setSelectedAsset({ ...row, assetClass: row.tipo })}
                />
              </Panel>

              <Panel title="Referencias de vulnerabilidad" subtitle="Alertas operativas de la capa de riesgo.">
                <div className="mini-metrics result-metrics">
                  <div><span>Interconexión Colombia</span><strong>{mw(criticalSource.interconexion_colombia.capacidad_maxima_mw)} máx.</strong></div>
                  <div><span>Coca Codo Sinclair</span><strong>{criticalSource.central_coca__codo_sinclair.riesgos_operativos}</strong></div>
                </div>
              </Panel>
            </div>
          </section>
        ) : null}

        {activeTab === 'expansion' ? (
          <section className="grid-two">
            <Panel title="Expansión e inversión" subtitle="Distribución PME 2023-2032 por actividad.">
              <div className="mini-metrics inline">
                <div><span>Total PME</span><strong>{musd(model.kpis.totalInversion)}</strong></div>
                <div><span>Generación</span><strong>{musd(investment.generacion)}</strong></div>
                <div><span>Transmisión</span><strong>{musd(investment.transmision)}</strong></div>
                <div><span>Distribución</span><strong>{musd(investment.distribucion)}</strong></div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer>
                  <BarChart data={model.investmentByActivity} margin={{ top: 8, right: 18, bottom: 10, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                    <XAxis dataKey="actividad" tick={{ fill: '#cbd5e1' }} />
                    <YAxis tick={{ fill: '#94a3b8' }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => musd(value)} />
                    <Bar dataKey="monto" radius={[8, 8, 0, 0]} fill="#38bdf8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <div className="stack-panels">
              <Panel title="Timeline de proyectos" subtitle="Proyectos estratégicos y bloques ERNC.">
                <div className="timeline">
                  {model.roadmap.map((item) => (
                    <button type="button" key={`${item.nombre}-${item.anio}`} onClick={() => setSelectedAsset({ ...item, assetClass: 'Proyecto de expansión', provincia: item.provincia || 'Nacional', notas: item.estado_pme || item.estado })}>
                      <span>{item.anio}</span>
                      <strong>{item.nombre}</strong>
                      <small>{item.tipo} · {mw(item.capacidad_mw)}</small>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Bloques ERNC" subtitle="Potencia total y subtotales por bloque.">
                <div className="mini-metrics inline">
                  <div><span>Total</span><strong>{mw(model.ernc.total_mw)}</strong></div>
                  <div><span>Bloque 1</span><strong>{mw(model.ernc.subtotales.bloque_1_2026_2027)}</strong></div>
                  <div><span>Bloque 2</span><strong>{mw(model.ernc.subtotales.bloque_2_2027_2028)}</strong></div>
                  <div><span>Bloque 3</span><strong>{mw(model.ernc.subtotales.bloque_3_2028_2030)}</strong></div>
                </div>
              </Panel>

              <Panel title="Metas 2032" subtitle="Metas sectoriales del plan.">
                <DataTable
                  columns={[
                    { key: 'meta', label: 'Meta' },
                    { key: 'valor', label: 'Valor' }
                  ]}
                  rows={[
                    { id: 'cobertura', meta: 'Cobertura', valor: model.metas2032.cobertura_servicio_nacional_objetivo },
                    { id: 'perdidas', meta: 'Pérdidas distribución', valor: model.metas2032.reduccion_perdidas_distribucion_meta },
                    { id: 'termica', meta: 'Generación firme térmica', valor: mw(model.metas2032.incorporacion_generacion_firme_termica_mw) },
                    { id: 'movilidad', meta: 'Movilidad eléctrica', valor: `${intFmt.format(model.metas2032.movilidad_electrica_proyeccion_unidades)} unidades` }
                  ]}
                />
              </Panel>
            </div>
          </section>
        ) : null}

        {activeTab === 'hidrologia' ? (
          <section className="grid-two">
            <div className="stack-panels">
              <Panel title="Hidrología y lluvias" subtitle={model.hidrologia.metadata_hidrologica.descripcion}>
                <div className="mini-metrics inline">
                  <div><span>Fuente</span><strong>{model.hidrologia.metadata_hidrologica.fuente_primaria}</strong></div>
                  <div><span>Caudal crítico dic. 2025</span><strong>{fmt.format(oriental.comportamiento_historico_reciente.caso_critico_dic_2025.caudal_real_m3_s)} m³/s</strong></div>
                  <div><span>Respecto media histórica</span><strong>{pct(oriental.comportamiento_historico_reciente.caso_critico_dic_2025.porcentaje_respecto_media_historica)}</strong></div>
                  <div><span>Probabilidad déficit crítico</span><strong>{model.hidrologia.modelacion_y_proyeccion_caudales.escenarios_riesgo_2026_2027.probabilidad_deficit_hidrologico_critico}</strong></div>
                </div>
                <div className="insight-box">
                  <p>{model.hidrologia.metadata_hidrologica._comentario}</p>
                  <p>Esta pestaña explica por qué lluvia en Costa u Occidente no implica automáticamente suficiencia energética si las cuencas orientales que alimentan al parque hidroeléctrico principal están en estiaje.</p>
                </div>
              </Panel>

              <Panel title="Vertiente oriental amazónica" subtitle="Principal fuente de generación hidráulica del S.N.I.">
                <div className="basin-card">
                  <p>{oriental.descripcion}</p>
                  <div><span>Estiaje</span><strong>{oriental.estacionalidad_estiaje}</strong></div>
                  <div><span>Comportamiento ene-nov 2025</span><strong>{oriental.comportamiento_historico_reciente.periodo_ene_nov_2025}</strong></div>
                  <div><span>Caso crítico</span><strong>{oriental.comportamiento_historico_reciente.caso_critico_dic_2025._comentario_tecnico}</strong></div>
                </div>
                <ul className="priority-list compact-list">
                  {oriental.centrales_asociadas.map((central) => <li key={central}>{central}</li>)}
                </ul>
              </Panel>
            </div>

            <div className="stack-panels">
              <Panel title="Complementariedad hidrológica" subtitle="Las vertientes tienen ciclos distintos y no sustituyen siempre la generación crítica.">
                <div className="basin-card">
                  <p>{occidental.descripcion}</p>
                  <div><span>Estiaje</span><strong>{occidental.estacionalidad_estiaje}</strong></div>
                  <div><span>Comentario técnico</span><strong>{occidental._comentario}</strong></div>
                </div>
                <ul className="priority-list compact-list">
                  {occidental.centrales_asociadas.map((central) => <li key={central}>{central}</li>)}
                </ul>
              </Panel>

              <Panel title="Riesgos hidrológicos y costo económico" subtitle="Escenarios vinculados a déficit, sedimentos y sequía.">
                <DataTable
                  columns={[
                    { key: 'indicador', label: 'Indicador' },
                    { key: 'valor', label: 'Valor' }
                  ]}
                  rows={[
                    { id: 'coca', indicador: 'Coca Codo Sinclair', valor: model.hidrologia.modelacion_y_proyeccion_caudales.escenarios_riesgo_2026_2027.impacto_infraestructura.coca_codo_sinclair },
                    { id: 'mazar', indicador: 'Mazar - Paute', valor: model.hidrologia.modelacion_y_proyeccion_caudales.escenarios_riesgo_2026_2027.impacto_infraestructura.mazar_paute },
                    { id: 'p50', indicador: 'Impacto sequía percentil 50', valor: musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_estimado_percentil_50) },
                    { id: 'p98', indicador: 'Impacto sequía extrema percentil 98', valor: musd(model.hidrologia.indicadores_economicos_por_sequia.impacto_sequia_extrema_percentil_98) }
                  ]}
                />
              </Panel>
            </div>
          </section>
        ) : null}

        {activeTab === 'mantenimiento' ? (
          <section className="grid-two">
            <div className="stack-panels">
              <Panel title="Mantenimiento y operación" subtitle={model.mantenimiento.metadata_mantenimientos._comentario}>
                <div className="mini-metrics inline">
                  <div><span>Fuente</span><strong>{model.mantenimiento.metadata_mantenimientos.fuente}</strong></div>
                  <div><span>Fecha emisión</span><strong>{model.mantenimiento.metadata_mantenimientos.fecha_emision}</strong></div>
                  <div><span>MW indisponibles programados</span><strong>{mw(model.maintenanceUnavailableMw)}</strong></div>
                  <div><span>MW recuperados</span><strong>{mw(model.maintenanceRecoveredMw)}</strong></div>
                </div>
                <div className="insight-box">
                  La potencia efectiva total no siempre equivale a potencia disponible. Por ejemplo, {mw(model.maintenanceUnavailableMw)} de Sopladora debe descontarse mientras su mantenimiento esté en ejecución.
                </div>
              </Panel>

              <Panel title="Programación de centrales críticas" subtitle="Trabajos programados o reprogramados de la capa operativa.">
                <div className="maintenance-grid">
                  {model.maintenances.map((item) => (
                    <button type="button" key={item.id_activo} onClick={() => setSelectedAsset({ ...item, nombre: item.central, assetClass: 'Mantenimiento' })}>
                      <span>{item.estado_actual}</span>
                      <strong>{item.central}</strong>
                      <small>{item.tipo_trabajo}</small>
                      <em>{item.impacto_mw_indisponible ? `${mw(item.impacto_mw_indisponible)} indisponibles` : item.impacto_mw_recuperado ? `${mw(item.impacto_mw_recuperado)} recuperados` : item.nueva_fecha_estimada || item.fecha_reintegro}</em>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="stack-panels">
              <Panel title="Alerta de planificación" subtitle="Reprogramaciones que aumentan riesgo operativo.">
                <div className="deficit-card maintenance-alert">
                  <span>Coca Codo Sinclair</span>
                  <strong>Junio 2026</strong>
                  <p>{model.maintenances[0].motivo_reprogramacion}</p>
                  <p>{model.maintenances[0].impacto_sistemico}</p>
                </div>
              </Panel>

              <Panel title="Política de mantenimiento" subtitle={model.mantenimiento.restricciones_y_politica_de_mantenimiento.modalidad}>
                <div className="insight-box">
                  <p>{model.mantenimiento.restricciones_y_politica_de_mantenimiento.regla_de_oro}</p>
                  <p>{model.mantenimiento.restricciones_y_politica_de_mantenimiento.alerta_de_planificacion}</p>
                </div>
                <ul className="priority-list">
                  {model.mantenimiento.restricciones_y_politica_de_mantenimiento.factores_condicionantes.map((factor) => <li key={factor}>{factor}</li>)}
                </ul>
              </Panel>

              <Panel title="Gestión de activos de transmisión" subtitle="Condiciones de intervención.">
                <DataTable
                  columns={[
                    { key: 'campo', label: 'Campo' },
                    { key: 'valor', label: 'Valor' }
                  ]}
                  rows={[
                    { id: 'req', campo: 'Requerimiento especial', valor: model.mantenimiento.gestion_de_activos_transmision.requerimiento_especial },
                    { id: 'cond', campo: 'Condición vincular', valor: model.mantenimiento.gestion_de_activos_transmision.condicion_vincular },
                    { id: 'supervision', campo: 'Supervisión', valor: model.mantenimiento.responsabilidades.supervision_y_aprobacion }
                  ]}
                />
              </Panel>
            </div>
          </section>
        ) : null}

        {activeTab === 'simulacion' ? (
          <section className="simulation-page">
            <Panel title="Simulación de apagones" subtitle="Motor CENACE simplificado: lluvia como único control manual, bases oficiales y mantenimiento opcional desactivado por defecto.">
              <div className="mini-metrics inline">
                <div><span>Carga actual del sistema</span><strong>{mw(DEMAND_MAX_MW)}</strong></div>
                <div><span>Reserva de seguridad</span><strong>{mw(SECURITY_RESERVE_MW)}</strong></div>
                <div><span>Punto de equilibrio</span><strong>{mw(SUFFICIENCY_REQUIREMENT_MW)}</strong></div>
                <div><span>Base térmica efectiva</span><strong>{mw(THERMAL_EFFECTIVE_BASE_MW)}</strong></div>
              </div>
              <div className="sim-grid">
                <SliderRow label="Nivel de lluvia" value={simulation.rainPct} min={0} max={100} unit="%" onChange={(value) => setSimulation((state) => ({ ...state, rainPct: value }))} helper="0% sequía total; 70% caudal crítico registrado; 100% límite operativo de referencia." />
                <SliderRow label="Autogeneración disponible" value={simulation.autogenPct} min={0} max={100} unit="%" onChange={(value) => setSimulation((state) => ({ ...state, autogenPct: value }))} helper={`Control manual sobre la autogeneración efectiva total de ${mw(model.groups.autogenEffective)}.`} />
                <SliderRow label="Importación Colombia" value={simulation.colombiaMw} min={0} max={450} unit=" MW" onChange={(value) => setSimulation((state) => ({ ...state, colombiaMw: value }))} helper="Capacidad máxima firme de referencia: 450 MW." />
              </div>

              <div className="subpanel">
                <div className="subpanel-header">
                  <h3>Mantenimiento opcional</h3>
                  <p>El simulador parte con todas las centrales activas. Solo descuenta las que marques manualmente.</p>
                </div>
                <div className="maintenance-select scrollable-select">
                  {maintenanceCandidates.map((item) => (
                    <label key={item.id}>
                      <input type="checkbox" checked={simulation.maintenanceIds.includes(item.id)} onChange={() => toggleSimulationMaintenance(item.id)} />
                      <span>{item.nombre}<small>{item.tipo} · {item.criterio}</small></span>
                      <strong>{mw(item.impacto_mw)}</strong>
                    </label>
                  ))}
                </div>
                <div className="source-note">Por defecto no se descuenta ninguna central. El bloque de mantenimiento queda desactivado hasta que el usuario marque activos específicos.</div>
              </div>
            </Panel>

            <div className="stack-panels">
            <Panel title="Resultado del escenario" subtitle="Déficit = oferta total simulada - punto de equilibrio.">
                <div className="sim-result-grid">
                  <div className={`sim-result ${simulationResult.balanceMW < 0 ? 'danger' : 'ok'}`}>
                    <span>{simulationResult.status}</span>
                    <strong>{mw(simulationResult.balanceMW)}</strong>
                    <p>{simulationResult.balanceMW < 0 ? 'Déficit negativo frente al punto de equilibrio.' : 'Superávit frente al punto de equilibrio.'}</p>
                  </div>
                  <div className={`sim-result probability ${simulationResult.outageProbability >= 20 ? 'danger' : simulationResult.outageProbability >= 12 ? 'warning' : 'ok'}`}>
                    <div className="sim-result-topline">
                      <span>Modelo A CENACE</span>
                      <button type="button" className="help-btn" onClick={() => toggleProbabilityHelp('cenace')}>
                        <Info size={14} />
                        Ayuda
                      </button>
                    </div>
                    <strong>{pct(simulationResult.outageProbability)}</strong>
                    <p>Vulnerabilidad estructural oficial acotada al 25%.</p>
                    {activeProbabilityHelp === 'cenace' ? (
                      <div className="methodology-note">
                        <strong>Vulnerabilidad Estructural</strong>
                        <p>{CENACE_HELP_TEXT}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className={`sim-result open-risk ${simulationResult.openFragility >= 60 ? 'danger' : simulationResult.openFragility >= 30 ? 'warning' : 'ok'}`}>
                    <div className="sim-result-topline">
                      <span>Modelo B abierto</span>
                      <button type="button" className="help-btn" onClick={() => toggleProbabilityHelp('open')}>
                        <Info size={14} />
                        Ayuda
                      </button>
                    </div>
                    <strong>{pct(simulationResult.openFragility)}</strong>
                    <p>Fragilidad operativa física sin techo oficial.</p>
                    {activeProbabilityHelp === 'open' ? (
                      <div className="methodology-note">
                        <strong>Fragilidad Operativa</strong>
                        <p>{OPEN_MODEL_HELP_TEXT}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mini-metrics result-metrics">
                  <div><span>Oferta total simulada</span><strong>{mw(simulationResult.totalAvailable)}</strong></div>
                  <div><span>Carga actual del sistema</span><strong>{mw(simulationResult.projectedPeakDemand)}</strong></div>
                  <div><span>Reserva de seguridad</span><strong>{mw(simulationResult.operatingReserve)}</strong></div>
                  <div><span>Punto de equilibrio</span><strong>{mw(simulationResult.adequacyRequirement)}</strong></div>
                  <div><span>Impacto mantenimiento</span><strong>{mw(simulationResult.maintenanceImpact)}</strong></div>
                  <div><span>Factor lluvia aplicado</span><strong>{pct(simulationResult.rainFactor * 100)}</strong></div>
                  <div><span>Autogeneración aplicada</span><strong>{mw(simulationResult.autogenAvailable)}</strong></div>
                  <div><span>Importación Colombia</span><strong>{mw(simulationResult.firmImport)}</strong></div>
                </div>
              </Panel>

              <Panel title="Desglose de potencia simulada" subtitle="Valores calculados desde capacidad efectiva y parámetros del usuario.">
                <DataTable
                  columns={[
                    { key: 'fuente', label: 'Fuente' },
                    { key: 'mw', label: 'MW', render: (row) => mw(row.mw) }
                  ]}
                  rows={[
                    { id: 'hydro', fuente: 'Hidroeléctrica ajustada por lluvia', mw: simulationResult.hydroAvailable },
                    { id: 'thermal', fuente: 'Térmica', mw: simulationResult.thermalAvailable },
                    { id: 'auto', fuente: 'Autogeneración', mw: simulationResult.autogenAvailable },
                    { id: 'colombia', fuente: 'Importación Colombia', mw: simulationResult.firmImport },
                    { id: 'maintenance', fuente: 'Mantenimiento hídrico activo', mw: -simulationResult.hydroMaintenanceImpact }
                  ]}
                />
              </Panel>

              <Panel title="Lectura de lluvia" subtitle="Regla usada por la simulación.">
                <div className="insight-box">
                  La lluvia de 70% reproduce el caudal crítico registrado por CENACE en diciembre de 2025. La lluvia de 100% representa el límite operativo de referencia que el sistema hidroeléctrico puede convertir en generación dentro de este modelo.
                </div>
              </Panel>

              <Panel title="Termómetro de vulnerabilidad" subtitle="Cómo interpretar el techo oficial del 25%.">
                <div className="risk-scale">
                  <div><span>0% a 5%</span><strong>Sistema estable</strong><p>Reservas suficientes y baja presión de suficiencia.</p></div>
                  <div><span>7% a 15%</span><strong>Alerta temprana</strong><p>Embalses bajando y mayor riesgo de cortes programados.</p></div>
                  <div><span>18% a 25%</span><strong>Zona crítica</strong><p>Márgenes de seguridad agotados; una falla imprevista puede derivar en cortes.</p></div>
                </div>
                <div className="source-note">El 25% no indica certeza de apagón. Es el límite máximo de vulnerabilidad estructural del S.N.I. ante sequías extremas en operación autónoma, sin ayuda de importaciones.</div>
              </Panel>

            </div>
          </section>
        ) : null}
      </main>

      <TechnicalSheetModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
    </div>
  );
}
