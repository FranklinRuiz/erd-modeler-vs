import type {Diagram, SerializedDiagram} from '@/types';

export function exportDiagramAsJSON(diagram: Diagram): string {
    const payload: SerializedDiagram = {
        version: '1.2',
        diagram,
    };
    return JSON.stringify(payload, null, 2);
}

export function importDiagramFromJSON(json: string): Diagram {
    const parsed = JSON.parse(json);
    if (!parsed.diagram || !['1.0', '1.1', '1.2'].includes(parsed.version)) {
        throw new Error('Invalid diagram file format.');
    }
    return parsed.diagram as Diagram;
}
