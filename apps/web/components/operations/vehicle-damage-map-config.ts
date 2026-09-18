import type { WorkshopVehicleType } from '@/lib/api';

export type VehicleMapView = 'front' | 'back' | 'left' | 'right' | 'top';

export type VehicleMapShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; points: string };

export type VehicleMapHotspot = {
  areaId: string;
  shape: VehicleMapShape;
};

export const VEHICLE_MAP_VIEWS: Array<{ id: VehicleMapView; label: string }> = [
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Parte trasera' },
  { id: 'left', label: 'Lado izquierdo' },
  { id: 'right', label: 'Lado derecho' },
  { id: 'top', label: 'Vista superior' },
];

export const VEHICLE_AREA_LABELS: Record<string, string> = {
  front_bumper: 'Parachoques delantero',
  rear_bumper: 'Parachoques trasero',
  hood: 'Capó',
  trunk: 'Baúl / compuerta trasera',
  roof: 'Techo',
  windshield: 'Parabrisas',
  rear_glass: 'Cristal trasero',
  grille: 'Parrilla',
  engine: 'Motor',
  front_axle: 'Eje delantero',
  rear_axle: 'Eje trasero',
  left_headlight: 'Faro delantero izquierdo',
  right_headlight: 'Faro delantero derecho',
  left_taillight: 'Luz trasera izquierda',
  right_taillight: 'Luz trasera derecha',
  left_front_fender: 'Guardalodo delantero izquierdo',
  right_front_fender: 'Guardalodo delantero derecho',
  left_rear_fender: 'Guardalodo trasero izquierdo',
  right_rear_fender: 'Guardalodo trasero derecho',
  left_front_door: 'Puerta delantera izquierda',
  left_rear_door: 'Puerta trasera izquierda',
  right_front_door: 'Puerta delantera derecha',
  right_rear_door: 'Puerta trasera derecha',
  left_mirror: 'Retrovisor izquierdo',
  right_mirror: 'Retrovisor derecho',
  left_front_wheel: 'Rueda delantera izquierda',
  left_rear_wheel: 'Rueda trasera izquierda',
  right_front_wheel: 'Rueda delantera derecha',
  right_rear_wheel: 'Rueda trasera derecha',
  left_skirt: 'Estribo izquierdo',
  right_skirt: 'Estribo derecho',
};

const sedan: Record<VehicleMapView, VehicleMapHotspot[]> = {
  front: [
    { areaId: 'windshield', shape: { kind: 'polygon', points: '28,12 72,12 78,34 22,34' } },
    { areaId: 'hood', shape: { kind: 'polygon', points: '22,35 78,35 84,56 16,56' } },
    { areaId: 'engine', shape: { kind: 'rect', x: 36, y: 39, width: 28, height: 14, rx: 3 } },
    { areaId: 'left_headlight', shape: { kind: 'ellipse', cx: 24, cy: 59, rx: 11, ry: 6 } },
    { areaId: 'right_headlight', shape: { kind: 'ellipse', cx: 76, cy: 59, rx: 11, ry: 6 } },
    { areaId: 'grille', shape: { kind: 'rect', x: 34, y: 57, width: 32, height: 13, rx: 3 } },
    { areaId: 'front_bumper', shape: { kind: 'polygon', points: '12,68 88,68 82,83 18,83' } },
    { areaId: 'front_axle', shape: { kind: 'rect', x: 18, y: 80, width: 64, height: 8, rx: 3 } },
  ],
  back: [
    { areaId: 'rear_glass', shape: { kind: 'polygon', points: '28,13 72,13 77,35 23,35' } },
    { areaId: 'trunk', shape: { kind: 'polygon', points: '20,36 80,36 83,59 17,59' } },
    { areaId: 'left_taillight', shape: { kind: 'ellipse', cx: 22, cy: 59, rx: 11, ry: 6 } },
    { areaId: 'right_taillight', shape: { kind: 'ellipse', cx: 78, cy: 59, rx: 11, ry: 6 } },
    { areaId: 'rear_bumper', shape: { kind: 'polygon', points: '12,68 88,68 82,84 18,84' } },
    { areaId: 'rear_axle', shape: { kind: 'rect', x: 18, y: 80, width: 64, height: 8, rx: 3 } },
  ],
  left: [
    { areaId: 'hood', shape: { kind: 'polygon', points: '5,42 27,36 34,50 9,56' } },
    { areaId: 'windshield', shape: { kind: 'polygon', points: '31,25 45,22 48,43 35,44' } },
    { areaId: 'roof', shape: { kind: 'polygon', points: '43,20 67,20 76,39 48,39' } },
    { areaId: 'rear_glass', shape: { kind: 'polygon', points: '68,23 81,31 78,44 73,40' } },
    { areaId: 'left_front_fender', shape: { kind: 'polygon', points: '9,50 31,45 34,72 8,72' } },
    { areaId: 'left_front_door', shape: { kind: 'polygon', points: '35,44 52,42 53,72 34,72' } },
    { areaId: 'left_rear_door', shape: { kind: 'polygon', points: '53,42 74,42 78,72 54,72' } },
    { areaId: 'left_rear_fender', shape: { kind: 'polygon', points: '75,44 94,51 94,72 78,72' } },
    { areaId: 'left_mirror', shape: { kind: 'ellipse', cx: 33, cy: 42, rx: 4, ry: 3 } },
    { areaId: 'left_front_wheel', shape: { kind: 'ellipse', cx: 24, cy: 72, rx: 8, ry: 14 } },
    { areaId: 'left_rear_wheel', shape: { kind: 'ellipse', cx: 79, cy: 72, rx: 8, ry: 14 } },
    { areaId: 'left_skirt', shape: { kind: 'rect', x: 32, y: 72, width: 40, height: 7, rx: 2 } },
  ],
  right: [
    { areaId: 'hood', shape: { kind: 'polygon', points: '66,50 73,36 95,42 91,56' } },
    { areaId: 'windshield', shape: { kind: 'polygon', points: '52,43 55,22 69,25 65,44' } },
    { areaId: 'roof', shape: { kind: 'polygon', points: '24,39 33,20 57,20 52,39' } },
    { areaId: 'rear_glass', shape: { kind: 'polygon', points: '19,31 32,23 27,40 22,44' } },
    { areaId: 'right_front_fender', shape: { kind: 'polygon', points: '66,45 91,50 92,72 66,72' } },
    { areaId: 'right_front_door', shape: { kind: 'polygon', points: '48,42 65,44 66,72 47,72' } },
    { areaId: 'right_rear_door', shape: { kind: 'polygon', points: '26,42 47,42 46,72 22,72' } },
    { areaId: 'right_rear_fender', shape: { kind: 'polygon', points: '6,51 25,44 22,72 6,72' } },
    { areaId: 'right_mirror', shape: { kind: 'ellipse', cx: 67, cy: 42, rx: 4, ry: 3 } },
    { areaId: 'right_front_wheel', shape: { kind: 'ellipse', cx: 76, cy: 72, rx: 8, ry: 14 } },
    { areaId: 'right_rear_wheel', shape: { kind: 'ellipse', cx: 21, cy: 72, rx: 8, ry: 14 } },
    { areaId: 'right_skirt', shape: { kind: 'rect', x: 28, y: 72, width: 40, height: 7, rx: 2 } },
  ],
  top: [
    { areaId: 'front_bumper', shape: { kind: 'rect', x: 25, y: 3, width: 50, height: 7, rx: 3 } },
    { areaId: 'hood', shape: { kind: 'polygon', points: '27,10 73,10 69,30 31,30' } },
    { areaId: 'engine', shape: { kind: 'rect', x: 38, y: 14, width: 24, height: 12, rx: 3 } },
    { areaId: 'windshield', shape: { kind: 'polygon', points: '31,31 69,31 65,42 35,42' } },
    { areaId: 'roof', shape: { kind: 'rect', x: 34, y: 43, width: 32, height: 30, rx: 7 } },
    { areaId: 'rear_glass', shape: { kind: 'polygon', points: '35,74 65,74 69,84 31,84' } },
    { areaId: 'trunk', shape: { kind: 'polygon', points: '31,85 69,85 73,95 27,95' } },
    { areaId: 'rear_bumper', shape: { kind: 'rect', x: 25, y: 94, width: 50, height: 5, rx: 2 } },
  ],
};

const suv: Record<VehicleMapView, VehicleMapHotspot[]> = {
  front: sedan.front.map((hotspot) => ({
    ...hotspot,
    shape:
      hotspot.shape.kind === 'rect'
        ? {
            ...hotspot.shape,
            y: Math.max(4, hotspot.shape.y - 2),
            height: hotspot.shape.height + 2,
          }
        : hotspot.shape,
  })),
  back: sedan.back.map((hotspot) => ({
    ...hotspot,
    shape:
      hotspot.shape.kind === 'ellipse'
        ? { ...hotspot.shape, ry: hotspot.shape.ry + 1 }
        : hotspot.shape,
  })),
  left: sedan.left.map((hotspot) => ({
    ...hotspot,
    shape:
      hotspot.shape.kind === 'rect'
        ? { ...hotspot.shape, y: hotspot.shape.y - 2, height: hotspot.shape.height + 2 }
        : hotspot.shape,
  })),
  right: sedan.right.map((hotspot) => ({
    ...hotspot,
    shape:
      hotspot.shape.kind === 'rect'
        ? { ...hotspot.shape, y: hotspot.shape.y - 2, height: hotspot.shape.height + 2 }
        : hotspot.shape,
  })),
  top: sedan.top.map((hotspot) => ({
    ...hotspot,
    shape:
      hotspot.shape.kind === 'rect'
        ? { ...hotspot.shape, x: hotspot.shape.x - 2, width: hotspot.shape.width + 4 }
        : hotspot.shape,
  })),
};

export const VEHICLE_HOTSPOTS: Record<
  WorkshopVehicleType,
  Record<VehicleMapView, VehicleMapHotspot[]>
> = {
  CAR: sedan,
  SUV: suv,
};

export const VEHICLE_VIEW_ASSETS: Record<WorkshopVehicleType, Record<VehicleMapView, string>> = {
  CAR: {
    front: '/assets/vehicles/sedan/front.png',
    back: '/assets/vehicles/sedan/back.png',
    left: '/assets/vehicles/sedan/left.png',
    right: '/assets/vehicles/sedan/right.png',
    top: '/assets/vehicles/sedan/top.png',
  },
  SUV: {
    front: '/assets/vehicles/suv/front.png',
    back: '/assets/vehicles/suv/back.png',
    left: '/assets/vehicles/suv/left.png',
    right: '/assets/vehicles/suv/right.png',
    top: '/assets/vehicles/suv/top.png',
  },
};

export const VEHICLE_VIEW_ASPECTS: Record<WorkshopVehicleType, Record<VehicleMapView, number>> = {
  CAR: {
    front: 1536 / 1024,
    back: 1536 / 1024,
    left: 1944 / 809,
    right: 2172 / 724,
    top: 887 / 1774,
  },
  SUV: {
    front: 1448 / 1086,
    back: 1448 / 1086,
    left: 1944 / 809,
    right: 1847 / 852,
    top: 941 / 1672,
  },
};

export function preferredVehicleViews(
  vehicleType: WorkshopVehicleType,
  areaIds: string[],
  limit = 2,
) {
  const remaining = new Set(areaIds);
  const selected: VehicleMapView[] = [];
  while (remaining.size && selected.length < limit) {
    const candidate = VEHICLE_MAP_VIEWS.map(({ id }) => ({
      id,
      hits: VEHICLE_HOTSPOTS[vehicleType][id].filter((spot) => remaining.has(spot.areaId)).length,
    })).sort((a, b) => b.hits - a.hits)[0];
    if (!candidate || candidate.hits === 0) break;
    selected.push(candidate.id);
    VEHICLE_HOTSPOTS[vehicleType][candidate.id].forEach((spot) => remaining.delete(spot.areaId));
  }
  return selected.length ? selected : (['front'] as VehicleMapView[]);
}
