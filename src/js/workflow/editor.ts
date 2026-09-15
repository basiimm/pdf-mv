import { NodeEditor } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import {
  ConnectionPlugin,
  Presets as ConnectionPresets,
} from 'rete-connection-plugin';
import { LitPlugin, Presets as LitPresets } from '@retejs/lit-plugin';
import type { ClassicScheme, LitArea2D } from '@retejs/lit-plugin';
import { DataflowEngine } from 'rete-engine';
import type { DataflowEngineScheme } from 'rete-engine';
import { LitElement, html } from 'lit';
import type { BaseWorkflowNode } from './nodes/base-node';
import phosphorCSS from '@phosphor-icons/web/regular?inline';

// Shared stylesheet for Phosphor icons (font-face already loaded globally, strip it)
const phosphorSheet = new CSSStyleSheet();
phosphorSheet.replaceSync(phosphorCSS.replace(/@font-face[^}]*\}/g, ''));

type AreaExtra = LitArea2D<ClassicScheme>;

export interface WorkflowEditor {
  editor: NodeEditor<ClassicScheme>;
  area: AreaPlugin<ClassicScheme, AreaExtra>;
  engine: DataflowEngine<DataflowEngineScheme>;
  destroy: () => void;
}

// Category-color-dot mapping: rotates the 4 semantic tokens available
// (no dedicated "category color" token exists) across the 6 categories.
// See also the header comment in src/design-system/canvas-tools.css.
const categoryColors: Record<string, string> = {
  Input: 'var(--ds-informative)',
  'Edit & Annotate': 'var(--ds-notice)',
  'Organize & Manage': 'var(--ds-positive)',
  'Optimize & Repair': 'var(--ds-accent-text)',
  'Secure PDF': 'var(--ds-informative)',
  Output: 'var(--ds-notice)',
};

function getStatusInfo(status: string, connected: boolean) {
  if (status === 'running')
    return { color: 'var(--ds-notice)', label: 'Running...', animate: true };
  if (status === 'completed')
    return { color: 'var(--ds-positive)', label: 'Complete', animate: false };
  if (status === 'error')
    return { color: 'var(--ds-negative)', label: 'Failed', animate: false };
  return {
    color: connected ? 'var(--ds-positive)' : 'var(--ds-text-muted)',
    label: connected ? 'Connected' : 'Not connected',
    animate: false,
  };
}

class WorkflowNodeElement extends LitElement {
  static properties = {
    data: { attribute: false },
    emit: { attribute: false },
  };

  declare data: BaseWorkflowNode | undefined;
  declare emit: ((data: unknown) => void) | undefined;

  createRenderRoot(): HTMLElement | ShadowRoot {
    return this;
  }

  render() {
    if (!this.data) return html``;
    const node = this.data;
    const inputs = Object.entries(node.inputs || {});
    const outputs = Object.entries(node.outputs || {});
    const color = categoryColors[node.category] || 'var(--ds-text-muted)';
    const emitFn = this.emit;

    return html`
      <div class="wf-node" style="--cat-color: ${color};">
        ${inputs.length > 0
          ? html`
              <div class="wf-sockets wf-sockets-top">
                ${inputs.map(([key, input]) =>
                  input
                    ? html`
                        <div class="wf-socket-slot">
                          <rete-ref
                            .data=${{
                              type: 'socket',
                              side: 'input',
                              key,
                              nodeId: node.id,
                              payload: input.socket,
                            }}
                            .emit=${emitFn}
                          ></rete-ref>
                        </div>
                      `
                    : null
                )}
              </div>
            `
          : null}
        <div class="wf-card">
          <div class="wf-status-track">
            <div data-wf="bar" class="wf-status-bar"></div>
          </div>
          <div class="wf-header">
            <span data-wf="dot" class="wf-cat-dot"></span>
            <span data-wf="label" class="wf-status-label">Not connected</span>
            <span data-wf-delete="${node.id}" class="wf-delete-btn">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </span>
          </div>
          <div class="wf-divider"></div>
          <div class="wf-body">
            <i class="ph ${node.icon} wf-icon"></i>
            <div class="wf-info">
              <div class="wf-title">${node.label}</div>
              <div class="wf-desc">${node.description}</div>
            </div>
          </div>
        </div>
        ${outputs.length > 0
          ? html`
              <div class="wf-sockets wf-sockets-bottom">
                ${outputs.map(([key, output]) =>
                  output
                    ? html`
                        <div class="wf-socket-slot">
                          <rete-ref
                            .data=${{
                              type: 'socket',
                              side: 'output',
                              key,
                              nodeId: node.id,
                              payload: output.socket,
                            }}
                            .emit=${emitFn}
                          ></rete-ref>
                        </div>
                      `
                    : null
                )}
              </div>
            `
          : null}
      </div>
    `;
  }
}

if (!customElements.get('wf-node')) {
  customElements.define('wf-node', WorkflowNodeElement);
}

export function updateNodeDisplay(
  nodeId: string,
  editor: NodeEditor<ClassicScheme>,
  area: AreaPlugin<ClassicScheme, AreaExtra>
) {
  const view = area.nodeViews.get(nodeId);
  if (!view) return;
  const el = view.element;
  const node = editor.getNode(nodeId) as BaseWorkflowNode;
  if (!node) return;

  const conns = editor.getConnections();
  const connected = conns.some(
    (c) => c.target === nodeId || c.source === nodeId
  );
  const status = node.execStatus || 'idle';
  const st = getStatusInfo(status, connected);

  const bar = el.querySelector<HTMLElement>('[data-wf="bar"]');
  const dot = el.querySelector<HTMLElement>('[data-wf="dot"]');
  const label = el.querySelector<HTMLElement>('[data-wf="label"]');

  if (bar) {
    bar.className = st.animate ? 'wf-status-bar wf-bar-slide' : 'wf-status-bar';
    bar.style.background = st.animate
      ? `linear-gradient(90deg, var(--ds-inset) 0%, ${st.color} 50%, var(--ds-inset) 100%)`
      : st.color;
    bar.style.opacity =
      status === 'idle' && !connected
        ? '0.35'
        : status === 'idle'
          ? '0.6'
          : '1';
    bar.style.backgroundSize = st.animate ? '200% 100%' : '';
  }

  if (dot) {
    dot.className = st.animate ? 'wf-cat-dot wf-dot-pulse' : 'wf-cat-dot';
    dot.style.background = st.color;
    dot.style.boxShadow = 'none';
  }

  if (label) {
    label.style.color = st.color;
    label.textContent = st.label;
  }
}

export async function createWorkflowEditor(
  container: HTMLElement
): Promise<WorkflowEditor> {
  const editor = new NodeEditor<ClassicScheme>();
  const area = new AreaPlugin<ClassicScheme, AreaExtra>(container);
  const connection = new ConnectionPlugin<ClassicScheme, AreaExtra>();
  const litPlugin = new LitPlugin<ClassicScheme, AreaExtra>();
  const engine = new DataflowEngine<DataflowEngineScheme>();

  litPlugin.addPreset(
    LitPresets.classic.setup({
      customize: {
        node(data) {
          return ({ emit }: { emit: (data: unknown) => void }) => {
            return html`<wf-node
              .data=${data.payload}
              .emit=${emit}
            ></wf-node>`;
          };
        },
        socket() {
          return () => {
            return html`<div class="wf-socket"></div>`;
          };
        },
      },
    })
  );

  connection.addPreset(ConnectionPresets.classic.setup());

  // Override connection path to use vertical bezier curves (top-to-bottom flow)
  litPlugin.addPipe((context) => {
    if ('type' in context && context.type === 'connectionpath') {
      const { points } = context.data;
      const [start, end] = points as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const curvature = 0.3;
      const horizontal = Math.abs(start.x - end.x);
      const dy =
        Math.max(horizontal / 2, Math.abs(end.y - start.y)) * curvature;
      const path = `M ${start.x} ${start.y} C ${start.x} ${start.y + dy} ${end.x} ${end.y - dy} ${end.x} ${end.y}`;
      return {
        ...context,
        data: { ...context.data, path },
      } as typeof context;
    }
    return context;
  });

  editor.use(area);
  area.use(connection);
  area.use(litPlugin);
  (editor as NodeEditor<DataflowEngineScheme>).use(engine);

  AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
    accumulating: AreaExtensions.accumulateOnCtrl(),
  });

  AreaExtensions.simpleNodesOrder(area);

  // Inject Phosphor icon styles into Shadow DOM roots created by the Lit plugin
  let phosphorTimer: ReturnType<typeof setTimeout> | null = null;
  const injectPhosphor = () => {
    if (phosphorTimer) return;
    phosphorTimer = setTimeout(() => {
      phosphorTimer = null;
      for (const el of container.querySelectorAll('*')) {
        const sr = (el as HTMLElement).shadowRoot;
        if (sr && !sr.adoptedStyleSheets.includes(phosphorSheet)) {
          sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, phosphorSheet];
        }
      }
    }, 50);
  };
  const observer = new MutationObserver(injectPhosphor);
  observer.observe(container, { childList: true, subtree: true });

  const onPointerDown = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-wf-delete]'
    );
    if (!target) return;
    e.stopPropagation();
    e.preventDefault();
    const nodeId = target.getAttribute('data-wf-delete');
    if (nodeId) {
      document.dispatchEvent(
        new CustomEvent('wf-delete-node', { detail: { nodeId } })
      );
    }
  };

  const onMouseEnter = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-wf-delete]'
    );
    if (!target) return;
    target.style.color = 'var(--ds-negative)';
    target.style.background = 'var(--ds-negative-bg)';
  };

  const onMouseLeave = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-wf-delete]'
    );
    if (!target) return;
    target.style.color = '';
    target.style.background = '';
  };

  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('mouseenter', onMouseEnter, true);
  container.addEventListener('mouseleave', onMouseLeave, true);

  return {
    editor,
    area,
    engine,
    destroy: () => {
      observer.disconnect();
      if (phosphorTimer) {
        clearTimeout(phosphorTimer);
        phosphorTimer = null;
      }
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('mouseenter', onMouseEnter, true);
      container.removeEventListener('mouseleave', onMouseLeave, true);
      area.destroy();
    },
  };
}
