(function (root) {
  "use strict";

  // Coordinates describe the demonstration floor plans, in percentages.
  // This clearance is a drawing constraint, not a real-world width measurement.
  const WALL_CLEARANCE = 0.9;
  const EPSILON = 1e-8;
  const GRID_OFFSET = WALL_CLEARANCE + 0.01;
  const ACCESS_NEEDS = ["wheelchair", "blind", "deaf"];

  function room(id, label, x, y, width, height, side = "bottom", dark = false) {
    return {
      id, label, x, y, width, height, dark, open: false,
      door: { x: x + width / 2, y: side === "top" ? y : y + height, side, width: 6 },
      target: { x: x + width / 2, y: y + height / 2 }
    };
  }

  function openArea(id, label, x, y, width, height) {
    return {
      id, label, x, y, width, height, dark: true, open: true, door: null,
      target: { x: x + width / 2, y: y + height / 2 }
    };
  }

  function facility(id, label, shortLabel, x, y, kind, status = "green", blockedFor = []) {
    return { id, label, shortLabel, x, y, kind, status, blockedFor };
  }

  function wallsForRoom(item) {
    if (item.open) return [];
    const left = item.x;
    const right = left + item.width;
    const top = item.y;
    const bottom = top + item.height;
    const walls = [];
    const add = (x1, y1, x2, y2) => walls.push({ x1, y1, x2, y2, roomId: item.id });
    add(left, top, left, bottom);
    add(right, top, right, bottom);
    for (const [side, y] of [["top", top], ["bottom", bottom]]) {
      if (item.door.side === side) {
        add(left, y, item.door.x - item.door.width / 2, y);
        add(item.door.x + item.door.width / 2, y, right, y);
      } else {
        add(left, y, right, y);
      }
    }
    return walls;
  }

  function getFloor(buildingId, floorNumber) {
    if (!["campus", "hospital"].includes(buildingId) || ![1, 2].includes(floorNumber)) {
      throw new RangeError("Gedung atau lantai tidak tersedia.");
    }
    const campus = buildingId === "campus";
    let rooms;
    let facilities;
    if (floorNumber === 1) {
      const height = campus ? 25 : 27;
      const secondRow = campus ? 39 : 41;
      const labels = campus
        ? [["classroom-a", "Ruang Kelas A"], ["classroom-b", "Ruang Kelas B"], ["library", "Perpustakaan"],
          ["computer-lab", "Lab Komputer"], ["lobby", "Lobby"], ["administration", "Ruang Administrasi"]]
        : [["polyclinic", "Poliklinik"], ["pharmacy", "Farmasi"], ["lobby", "Lobby"],
          ["laboratory", "Laboratorium"], ["radiology", "Radiologi"], ["emergency", "IGD"]];
      rooms = labels.map(([id, label], index) => room(
        id, label, [4, 35, 66][index % 3], index < 3 ? 7 : secondRow,
        28, height, index < 3 ? "bottom" : "top"
      ));
      rooms.push(campus
        ? openArea("open-area", "Area Terbuka", 4, 71, 90, 21)
        : openArea("waiting-area", "Area Tunggu", 4, 73, 90, 17));
      const lowerCorridor = campus ? 67.5 : 70.5;
      facilities = [
        facility("lift", "Lift", "Lift", 40, campus ? 35.5 : 37.5, "lift"),
        facility("ramp", campus ? "Ramp utama" : "Ramp ambulans", "Ramp", 9, lowerCorridor, "ramp"),
        facility("toilet", "Toilet difabel", "Toilet ♿", 73, lowerCorridor, "toilet"),
        facility("entrance", "Pintu masuk", "Masuk", 96.5, lowerCorridor, "entrance")
      ];
    } else {
      const labels = campus
        ? [["classroom-c", "Ruang Kelas C"], ["seminar", "Ruang Seminar"], ["studio", "Studio"],
          ["laboratory", "Laboratorium"], ["lecturers", "Ruang Dosen"]]
        : [["outpatient", "Rawat Jalan"], ["room-201", "Kamar 201"], ["room-202", "Kamar 202"],
          ["nursing", "Ruang Perawatan"], ["consultation", "Konsultasi"]];
      rooms = labels.map(([id, label], index) => index < 3
        ? room(id, label, [5, 36, 67][index], 8, 27, 27)
        : room(id, label, index === 3 ? 5 : 67, 43, index === 3 ? 58 : 27, 42, "top", index === 4));
      facilities = [
        facility("lift", "Lift", "Lift", 40, 39, "lift"),
        facility("toilet", "Toilet difabel", "Toilet ♿", 73, 39, "toilet", campus ? "yellow" : "green"),
        facility("exit", campus ? "Pintu belakang (bertangga)" : "Pintu keluar", "Keluar", 84, 90,
          "exit", campus ? "red" : "green", campus ? ["wheelchair"] : [])
      ];
    }
    return {
      buildingId, floorNumber, rooms, facilities,
      walls: rooms.flatMap(wallsForRoom),
      destinations: [
        ...rooms.map(item => ({ id: item.id, label: item.label, ...item.target, blockedFor: [] })),
        ...facilities.map(item => ({ id: item.id, label: item.label, x: item.x, y: item.y, blockedFor: [...item.blockedFor] }))
      ]
    };
  }

  function validPoint(point) {
    return point !== null && typeof point === "object" && Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= WALL_CLEARANCE && point.x <= 100 - WALL_CLEARANCE
      && point.y >= WALL_CLEARANCE && point.y <= 100 - WALL_CLEARANCE;
  }

  function wallBounds(wall) {
    return {
      left: Math.min(wall.x1, wall.x2) - WALL_CLEARANCE,
      right: Math.max(wall.x1, wall.x2) + WALL_CLEARANCE,
      top: Math.min(wall.y1, wall.y2) - WALL_CLEARANCE,
      bottom: Math.max(wall.y1, wall.y2) + WALL_CLEARANCE
    };
  }

  function isWalkable(floor, point) {
    if (!floor || !Array.isArray(floor.walls) || !validPoint(point)) return false;
    return !floor.walls.some(wall => {
      const bounds = wallBounds(wall);
      return point.x >= bounds.left - EPSILON && point.x <= bounds.right + EPSILON
        && point.y >= bounds.top - EPSILON && point.y <= bounds.bottom + EPSILON;
    });
  }

  // Also checks the complete segment: valid endpoints alone do not prove that
  // a route can pass between them without crossing an intervening room wall.
  function isSegmentWalkable(floor, start, end) {
    if (!isWalkable(floor, start) || !isWalkable(floor, end)) return false;
    const vertical = start.x === end.x;
    const horizontal = start.y === end.y;
    if (!vertical && !horizontal) return false;
    return !floor.walls.some(wall => {
      const bounds = wallBounds(wall);
      if (vertical) {
        return start.x >= bounds.left - EPSILON && start.x <= bounds.right + EPSILON
          && Math.max(start.y, end.y) >= bounds.top - EPSILON
          && Math.min(start.y, end.y) <= bounds.bottom + EPSILON;
      }
      return start.y >= bounds.top - EPSILON && start.y <= bounds.bottom + EPSILON
        && Math.max(start.x, end.x) >= bounds.left - EPSILON
        && Math.min(start.x, end.x) <= bounds.right + EPSILON;
    });
  }

  function samePoint(left, right) {
    return left.x === right.x && left.y === right.y;
  }

  class MinHeap {
    constructor() { this.items = []; }
    push(item) {
      const list = this.items;
      list.push(item);
      let index = list.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (list[parent].priority <= item.priority) break;
        list[index] = list[parent];
        index = parent;
      }
      list[index] = item;
    }
    pop() {
      const list = this.items;
      const first = list[0];
      const last = list.pop();
      if (list.length) {
        let index = 0;
        while (index * 2 + 1 < list.length) {
          let child = index * 2 + 1;
          if (child + 1 < list.length && list[child + 1].priority < list[child].priority) child++;
          if (last.priority <= list[child].priority) break;
          list[index] = list[child];
          index = child;
        }
        list[index] = last;
      }
      return first;
    }
    get length() { return this.items.length; }
  }

  function coordinateAxes(floor, start, end) {
    const xs = new Set([WALL_CLEARANCE, 100 - WALL_CLEARANCE, start.x, end.x]);
    const ys = new Set([WALL_CLEARANCE, 100 - WALL_CLEARANCE, start.y, end.y]);
    const add = (set, value) => {
      if (value >= WALL_CLEARANCE && value <= 100 - WALL_CLEARANCE) set.add(value);
    };
    for (const wall of floor.walls) {
      for (const x of [wall.x1, wall.x2]) {
        add(xs, x - GRID_OFFSET);
        add(xs, x + GRID_OFFSET);
      }
      for (const y of [wall.y1, wall.y2]) {
        add(ys, y - GRID_OFFSET);
        add(ys, y + GRID_OFFSET);
      }
    }
    for (const item of floor.rooms || []) {
      if (item.door) {
        add(xs, item.door.x);
        add(ys, item.door.y);
      }
    }
    for (const item of floor.destinations || []) {
      add(xs, item.x);
      add(ys, item.y);
    }
    return { xs: [...xs].sort((a, b) => a - b), ys: [...ys].sort((a, b) => a - b) };
  }

  function simplify(points) {
    const result = [];
    for (const point of points) {
      if (result.length && samePoint(result[result.length - 1], point)) continue;
      while (result.length >= 2) {
        const a = result[result.length - 2];
        const b = result[result.length - 1];
        if ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)) result.pop();
        else break;
      }
      result.push(point);
    }
    return result;
  }

  function findRoute(floor, start, end, need = "wheelchair") {
    if (!ACCESS_NEEDS.includes(need) || !isWalkable(floor, start) || !isWalkable(floor, end)) return null;
    const blocked = item => Array.isArray(item.blockedFor) && item.blockedFor.includes(need);
    if (blocked(end) || (floor.destinations || []).some(item =>
      (samePoint(item, end) || (end.id && item.id === end.id)) && blocked(item))) return null;

    const from = { x: start.x, y: start.y };
    const to = { x: end.x, y: end.y };
    if (samePoint(from, to)) return { points: [from], distance: 0 };
    const { xs, ys } = coordinateAxes(floor, from, to);
    const width = xs.length;
    const count = width * ys.length;
    const node = (xIndex, yIndex) => yIndex * width + xIndex;
    const point = index => ({ x: xs[index % width], y: ys[Math.floor(index / width)] });
    const startNode = node(xs.indexOf(from.x), ys.indexOf(from.y));
    const endNode = node(xs.indexOf(to.x), ys.indexOf(to.y));
    const distances = new Float64Array(count).fill(Infinity);
    const previous = new Int32Array(count).fill(-1);
    const walkable = new Int8Array(count).fill(-1);
    const canVisit = index => {
      if (walkable[index] === -1) walkable[index] = isWalkable(floor, point(index)) ? 1 : 0;
      return walkable[index] === 1;
    };
    const heuristic = position => Math.abs(position.x - to.x) + Math.abs(position.y - to.y);
    const queue = new MinHeap();
    distances[startNode] = 0;
    queue.push({ index: startNode, distance: 0, priority: heuristic(from) });

    while (queue.length) {
      const current = queue.pop();
      if (current.distance > distances[current.index] + EPSILON) continue;
      if (current.index === endNode) {
        const points = [];
        for (let index = endNode; index !== -1; index = previous[index]) points.push(point(index));
        const route = simplify(points.reverse());
        // Preserve the supplied coordinates exactly; no snapping or teleporting.
        route[0] = from;
        route[route.length - 1] = to;
        const distance = route.reduce((sum, item, index) => index === 0 ? 0 : sum
          + Math.abs(item.x - route[index - 1].x) + Math.abs(item.y - route[index - 1].y), 0);
        return { points: route, distance };
      }
      const xIndex = current.index % width;
      const yIndex = Math.floor(current.index / width);
      const neighbors = [];
      if (xIndex + 1 < width) neighbors.push(current.index + 1);
      if (yIndex + 1 < ys.length) neighbors.push(current.index + width);
      if (xIndex > 0) neighbors.push(current.index - 1);
      if (yIndex > 0) neighbors.push(current.index - width);
      const currentPoint = point(current.index);
      for (const neighbor of neighbors) {
        if (!canVisit(neighbor)) continue;
        const next = point(neighbor);
        const distance = current.distance + Math.abs(next.x - currentPoint.x) + Math.abs(next.y - currentPoint.y);
        if (distance >= distances[neighbor] - EPSILON || !isSegmentWalkable(floor, currentPoint, next)) continue;
        distances[neighbor] = distance;
        previous[neighbor] = current.index;
        queue.push({ index: neighbor, distance, priority: distance + heuristic(next) });
      }
    }
    return null;
  }

  const api = { getFloor, isWalkable, isSegmentWalkable, findRoute, WALL_CLEARANCE };
  root.AksesinRouting = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
