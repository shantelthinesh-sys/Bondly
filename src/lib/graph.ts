import type {
  GraphNode,
  BFSResult,
  BFSStep,
} from './types';

/**
 * SocialGraph — an in-memory adjacency-list graph used as the computational
 * representation of the database's accepted friendships. The database remains
 * the persistent source of truth; the graph is rebuilt from it on demand.
 *
 * Implemented with real BFS, shortest-path, mutual-friend, and Jaccard
 * calculations — no mock logic.
 */
export class SocialGraph {
  private adjacency = new Map<string, Set<string>>();
  private nodes = new Map<string, GraphNode>();

  addNode(node: GraphNode): void {
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
    this.nodes.set(node.id, node);
  }

  addEdge(a: string, b: string): void {
    if (a === b) return;
    this.ensure(a);
    this.ensure(b);
    this.adjacency.get(a)!.add(b);
    this.adjacency.get(b)!.add(a);
  }

  removeEdge(a: string, b: string): void {
    this.adjacency.get(a)?.delete(b);
    this.adjacency.get(b)?.delete(a);
  }

  private ensure(id: string): void {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, new Set());
    }
  }

  hasNode(id: string): boolean {
    return this.adjacency.has(id);
  }

  getNeighbors(id: string): Set<string> {
    return this.adjacency.get(id) ?? new Set();
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  allNodes(): string[] {
    return Array.from(this.adjacency.keys());
  }

  nodeCount(): number {
    return this.adjacency.size;
  }

  edgeCount(): number {
    let count = 0;
    for (const neighbors of this.adjacency.values()) {
      count += neighbors.size;
    }
    return Math.floor(count / 2);
  }

  /**
   * Mutual friends = |N(A) ∩ N(B)|
   */
  mutualFriends(a: string, b: string): string[] {
    const na = this.getNeighbors(a);
    const nb = this.getNeighbors(b);
    const result: string[] = [];
    for (const n of na) {
      if (n !== a && n !== b && nb.has(n)) result.push(n);
    }
    return result;
  }

  /**
   * Jaccard similarity J(A,B) = |N(A) ∩ N(B)| / |N(A) ∪ N(B)|
   * Handles empty union safely (returns 0).
   */
  jaccard(a: string, b: string): number {
    const na = this.getNeighbors(a);
    const nb = this.getNeighbors(b);
    const union = new Set<string>([...na, ...nb]);
    if (union.size === 0) return 0;
    let intersection = 0;
    for (const n of na) {
      if (n !== a && n !== b && nb.has(n)) intersection++;
    }
    return intersection / union.size;
  }

  /**
   * Friends-of-friends excluding direct friends and self.
   */
  friendsOfFriends(id: string): Set<string> {
    const direct = this.getNeighbors(id);
    const fof = new Set<string>();
    for (const friend of direct) {
      for (const n of this.getNeighbors(friend)) {
        if (n !== id && !direct.has(n)) {
          fof.add(n);
        }
      }
    }
    return fof;
  }

  isConnected(a: string, b: string): boolean {
    return this.getNeighbors(a).has(b);
  }

  /**
   * BFS shortest path in an unweighted graph.
   * Returns the list of node ids from start to end (inclusive), or null.
   */
  shortestPath(start: string, end: string, maxDepth = 6): string[] | null {
    if (start === end) return [start];
    if (!this.hasNode(start) || !this.hasNode(end)) return null;

    const queue: string[] = [start];
    const visited = new Set<string>([start]);
    const parent = new Map<string, string | null>([[start, null]]);

    let level = 0;
    while (queue.length > 0 && level <= maxDepth) {
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const current = queue.shift()!;
        if (current === end) {
          return reconstructPath(parent, end);
        }
        for (const neighbor of this.getNeighbors(current)) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            parent.set(neighbor, current);
            queue.push(neighbor);
          }
        }
      }
      level++;
    }
    return null;
  }

  /**
   * Connection distance = BFS level of end from start. Returns Infinity if
   * unreachable within maxDepth.
   */
  connectionDistance(a: string, b: string, maxDepth = 6): number {
    if (a === b) return 0;
    if (!this.hasNode(a) || !this.hasNode(b)) return Infinity;

    const queue: string[] = [a];
    const visited = new Set<string>([a]);
    let level = 0;
    while (queue.length > 0 && level <= maxDepth) {
      const size = queue.length;
      for (let i = 0; i < size; i++) {
        const current = queue.shift()!;
        if (current === b) return level;
        for (const n of this.getNeighbors(current)) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      level++;
    }
    return Infinity;
  }

  /**
   * Step-by-step BFS traversal with full execution log.
   * Returns every micro-step for the visualizer: enqueue, dequeue, visit, edge discovery.
   */
  bfsWithSteps(start: string, maxDepth: number): BFSResult {
    const steps: BFSStep[] = [];
    const queue: string[] = [];
    const visited = new Set<string>();
    const levels: Record<string, number> = {};
    const edges: { from: string; to: string }[] = [];
    let stepNum = 0;

    if (!this.hasNode(start)) {
      return { steps, visitedOrder: [], levels: {}, edges: [] };
    }

    queue.push(start);
    visited.add(start);
    levels[start] = 0;
    stepNum++;
    steps.push({
      step: stepNum,
      action: 'enqueue',
      queue: [...queue],
      visited: [...visited],
      currentNode: null,
      discoveredEdges: [],
      levels: { ...levels },
      description: `Step 1: Add starting user to the queue. Queue: [${start}]`,
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      stepNum++;
      steps.push({
        step: stepNum,
        action: 'dequeue',
        queue: [...queue],
        visited: [...visited],
        currentNode: current,
        discoveredEdges: [],
        levels: { ...levels },
        description: `Step ${stepNum}: Dequeue ${this.labelOf(current)} (level ${levels[current]}).`,
      });

      if (levels[current] >= maxDepth) continue;

      const newEdges: { from: string; to: string }[] = [];
      for (const neighbor of this.getNeighbors(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          levels[neighbor] = levels[current] + 1;
          queue.push(neighbor);
          edges.push({ from: current, to: neighbor });
          newEdges.push({ from: current, to: neighbor });
          stepNum++;
          steps.push({
            step: stepNum,
            action: 'visit',
            queue: [...queue],
            visited: [...visited],
            currentNode: neighbor,
            discoveredEdges: newEdges.slice(-1),
            levels: { ...levels },
            description: `Step ${stepNum}: Visit unvisited neighbor ${this.labelOf(neighbor)} → enqueue at level ${levels[neighbor]}.`,
          });
        } else {
          edges.push({ from: current, to: neighbor });
        }
      }
    }

    stepNum++;
    steps.push({
      step: stepNum,
      action: 'complete',
      queue: [],
      visited: [...visited],
      currentNode: null,
      discoveredEdges: [],
      levels: { ...levels },
      description: `BFS complete. Visited ${visited.size} users across ${Math.max(0, ...Object.values(levels))} levels.`,
    });

    return {
      steps,
      visitedOrder: [...visited],
      levels,
      edges,
    };
  }

  private labelOf(id: string): string {
    return this.nodes.get(id)?.label ?? id.slice(0, 6);
  }

  /**
   * Degree centrality for a node: degree / (n-1).
   */
  degreeCentrality(id: string): number {
    const n = this.nodeCount();
    if (n <= 1) return 0;
    return this.getNeighbors(id).size / (n - 1);
  }

  isolatedNodes(): string[] {
    const result: string[] = [];
    for (const [id, neighbors] of this.adjacency.entries()) {
      if (neighbors.size === 0) result.push(id);
    }
    return result;
  }

  averageDegree(): number {
    if (this.nodeCount() === 0) return 0;
    let total = 0;
    for (const neighbors of this.adjacency.values()) total += neighbors.size;
    return total / this.nodeCount();
  }

  /**
   * Second-degree connections: users exactly 2 hops away.
   */
  secondDegreeCount(id: string): number {
    let count = 0;
    for (const n of this.allNodes()) {
      const d = this.connectionDistance(id, n, 2);
      if (d === 2) count++;
    }
    return count;
  }
}

function reconstructPath(parent: Map<string, string | null>, end: string): string[] {
  const path: string[] = [];
  let current: string | null = end;
  while (current !== null) {
    path.unshift(current);
    current = parent.get(current) ?? null;
  }
  return path;
}
