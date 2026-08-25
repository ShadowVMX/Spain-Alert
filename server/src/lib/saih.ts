import { XMLParser } from "fast-xml-parser";
import { cached } from "./cache.js";

/**
 * Capas WMS nacionales del MITECO que agregan el SAIH de TODAS las confederaciones
 * hidrográficas (Ebro, Júcar, Duero, Segura, Guadalquivir, Cantábrico...) en un único
 * servicio, en vez de tener que integrar cuenca a cuenca. Confirmado por búsqueda
 * (WMS 1.3.0, perfil INSPIRE, GetFeatureInfo soportado); no se ha podido probar en
 * vivo desde este entorno de desarrollo porque el proxy de red del sandbox bloquea
 * la salida a mapama.gob.es. Verificar el primer despliegue real y avisar si algo
 * no carga.
 */
export const SAIH_LAYERS = {
  rios: "https://wms.mapama.gob.es/sig/agua/saih/rios/wms.aspx",
  embalses: "https://wms.mapama.gob.es/sig/agua/saih/embalses/wms.aspx",
  pluviometria: "https://wms.mapama.gob.es/sig/agua/saih/pluviometria/wms.aspx",
} as const;

export type SaihCapa = keyof typeof SAIH_LAYERS;

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, attributeNamePrefix: "@_" });

interface CapabilitiesLayerNode {
  Name?: string;
  Layer?: CapabilitiesLayerNode | CapabilitiesLayerNode[];
}

function firstLayerName(node: CapabilitiesLayerNode | undefined): string | null {
  if (!node) return null;
  const children = Array.isArray(node.Layer) ? node.Layer : node.Layer ? [node.Layer] : [];
  for (const child of children) {
    if (child.Name) return child.Name;
    const nested = firstLayerName(child);
    if (nested) return nested;
  }
  return null;
}

/** Descubre el nombre real de la capa vía GetCapabilities, en vez de asumirlo a ciegas. */
async function discoverLayerName(capa: SaihCapa): Promise<string> {
  const url = `${SAIH_LAYERS[capa]}?service=WMS&request=GetCapabilities&version=1.3.0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GetCapabilities de SAIH ${capa} falló: HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as { WMS_Capabilities?: { Capability?: { Layer?: CapabilitiesLayerNode } } };
  const name = firstLayerName(parsed.WMS_Capabilities?.Capability?.Layer);
  if (!name) throw new Error(`No se encontró ninguna capa en GetCapabilities de SAIH ${capa}`);
  return name;
}

export function getSaihLayerName(capa: SaihCapa): Promise<string> {
  return cached(`saih-layer-${capa}`, 24 * 60 * 60 * 1000, () => discoverLayerName(capa));
}

export interface FeatureInfoRequest {
  capa: SaihCapa;
  bbox: string; // "minx,miny,maxx,maxy" en el CRS indicado
  width: number;
  height: number;
  i: number;
  j: number;
  crs?: string;
}

/** Proxy de GetFeatureInfo: evita problemas de CORS y mantiene la lógica de descubrir la capa en el backend. */
export async function getSaihFeatureInfo(req: FeatureInfoRequest): Promise<string> {
  const layerName = await getSaihLayerName(req.capa);
  const crs = req.crs ?? "EPSG:3857";
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetFeatureInfo",
    layers: layerName,
    query_layers: layerName,
    styles: "",
    crs,
    bbox: req.bbox,
    width: String(req.width),
    height: String(req.height),
    i: String(req.i),
    j: String(req.j),
    info_format: "text/plain",
    feature_count: "5",
  });
  const url = `${SAIH_LAYERS[req.capa]}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GetFeatureInfo de SAIH ${req.capa} falló: HTTP ${res.status}`);
  return res.text();
}
