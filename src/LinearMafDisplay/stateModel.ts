import { lazy } from 'react'

import { ConfigurationReference, getConf } from '@jbrowse/core/configuration'
import {
  getContainingTrack,
  getContainingView,
  getEnv,
  getSession,
  max,
  measureText,
} from '@jbrowse/core/util'
import { getRpcSessionId } from '@jbrowse/core/util/tracks'
import { addDisposer, cast, isAlive, types } from '@jbrowse/mobx-state-tree'
import deepEqual from 'fast-deep-equal'
import { autorun } from 'mobx'

import {
  assignDepthY,
  eachAfter,
  hierarchy,
  leaves,
  maxLength,
  setBrLength,
  sort,
  sum,
} from './hierarchy'
import { computeNodeDescendantNames } from './util'
import { normalize } from '../util'

import type { HierarchyNode } from './hierarchy'
import type { NodeWithIds, Sample } from './types'
import type PluginManager from '@jbrowse/core/PluginManager'
import type {
  AnyConfigurationModel,
  AnyConfigurationSchemaType,
} from '@jbrowse/core/configuration'
import type { SessionWithWidgets } from '@jbrowse/core/util'
import type { Instance } from '@jbrowse/mobx-state-tree'
import type LinearGenomeViewPlugin from '@jbrowse/plugin-linear-genome-view'
import type { ExportSvgDisplayOptions } from '@jbrowse/plugin-linear-genome-view'

const defaultRowHeight = 15
const defaultRowProportion = 0.8
const defaultShowAllLetters = false
const defaultMismatchRendering = true
const defaultShowBranchLen = false
const defaultTreeAreaWidth = 80
const defaultShowAsUpperCase = true
const defaultShowSidebar = true

const SetRowHeightDialog = lazy(
  () => import('./components/SetRowHeightDialog/SetRowHeightDialog'),
)

/**
 * #stateModel LinearMafDisplay
 * extends LinearBasicDisplay
 */
export default function stateModelFactory(
  configSchema: AnyConfigurationSchemaType,
  pluginManager: PluginManager,
) {
  const LinearGenomePlugin = pluginManager.getPlugin(
    'LinearGenomeViewPlugin',
  ) as LinearGenomeViewPlugin
  const { BaseLinearDisplay } = LinearGenomePlugin.exports

  return types
    .compose(
      'LinearMafDisplay',
      BaseLinearDisplay,
      types.model({
        /**
         * #property
         */
        type: types.literal('LinearMafDisplay'),
        /**
         * #property
         */
        configuration: ConfigurationReference(configSchema),
        /**
         * #property
         */
        rowHeight: defaultRowHeight,
        /**
         * #property
         */
        rowProportion: defaultRowProportion,
        /**
         * #property
         */
        showAllLetters: defaultShowAllLetters,
        /**
         * #property
         */
        mismatchRendering: defaultMismatchRendering,

        /**
         * #property
         */
        showBranchLen: defaultShowBranchLen,

        /**
         * #property
         */
        treeAreaWidth: defaultTreeAreaWidth,
        /**
         * #property
         */
        showAsUpperCase: defaultShowAsUpperCase,
        /**
         * #property
         */
        showSidebar: defaultShowSidebar,
        /**
         * #property
         */
        subtreeFilter: types.maybe(types.array(types.string)),
      }),
    )
    .volatile(() => ({
      /**
       * #volatile
       */
      hoveredInfo: undefined as Record<string, unknown> | undefined,
      /**
       * #volatile
       */
      prefersOffset: true,
      /**
       * #volatile
       */
      volatileSamples: undefined as Sample[] | undefined,
      /**
       * #volatile
       */
      volatileTree: undefined as NodeWithIds | undefined,
      /**
       * #volatile
       */
      highlightedRowNames: undefined as string[] | undefined,
      /**
       * #volatile
       */
      hoveredTreeNode: undefined as { x: number; y: number } | undefined,
      /**
       * #volatile
       */
      treeMenuAnchor: undefined as
        | { x: number; y: number; names: string[] }
        | undefined,
    }))
    .actions(self => ({
      /**
       * #action
       */
      setHoveredInfo(arg?: Record<string, unknown>) {
        self.hoveredInfo = arg
      },
      /**
       * #action
       */
      setRowHeight(n: number) {
        self.rowHeight = n
      },
      /**
       * #action
       */
      setRowProportion(n: number) {
        self.rowProportion = n
      },
      /**
       * #action
       */
      setShowAllLetters(f: boolean) {
        self.showAllLetters = f
      },
      /**
       * #action
       */
      setMismatchRendering(f: boolean) {
        self.mismatchRendering = f
      },
      /**
       * #action
       */
      setSamples({
        samples,
        tree,
      }: {
        samples: Sample[]
        tree: NodeWithIds | undefined
      }) {
        if (!deepEqual(samples, self.volatileSamples)) {
          self.volatileSamples = samples
        }
        if (!deepEqual(tree, self.volatileTree)) {
          self.volatileTree = tree
        }
      },
      /**
       * #action
       */
      setShowAsUpperCase(arg: boolean) {
        self.showAsUpperCase = arg
      },
      /**
       * #action
       */
      setTreeAreaWidth(width: number) {
        self.treeAreaWidth = width
      },
      /**
       * #action
       */
      setShowSidebar(arg: boolean) {
        self.showSidebar = arg
      },
      /**
       * #action
       */
      setHighlightedRowNames(
        names?: string[],
        nodePosition?: { x: number; y: number },
      ) {
        self.highlightedRowNames = names
        self.hoveredTreeNode = nodePosition
      },
      /**
       * #action
       */
      setSubtreeFilter(names?: string[]) {
        self.subtreeFilter = cast(names)
      },
      /**
       * #action
       */
      setTreeMenuAnchor(anchor?: { x: number; y: number; names: string[] }) {
        self.treeMenuAnchor = anchor
      },
      /**
       * #action
       */
      showInsertionSequenceDialog(insertionData: {
        sequence: string
        sampleLabel: string
        chr: string
        pos: number
      }) {
        const { sequence, sampleLabel, chr, pos } = insertionData
        const session = getSession(self) as SessionWithWidgets
        const featureWidget = session.addWidget(
          'BaseFeatureWidget',
          'baseFeature',
          {
            featureData: {
              uniqueId: `insertion-${chr}-${pos}-${sampleLabel}`,
              type: 'insertion',
              refName: chr,
              start: pos,
              end: pos + 1,
              sample: sampleLabel,
              insertionLength: sequence.length,
              sequence: self.showAsUpperCase
                ? sequence.toUpperCase()
                : sequence.toLowerCase(),
            },
            view: getContainingView(self),
            track: getContainingTrack(self),
          },
        )

        session.showWidget(featureWidget)
      },
    }))
    .views(self => ({
      /**
       * #getter
       */
      get rendererTypeName() {
        return 'LinearMafRenderer'
      },

      /**
       * #getter
       */
      get rendererConfig(): AnyConfigurationModel {
        const configBlob = getConf(self, ['renderer']) || {}
        const config = configBlob as Omit<typeof configBlob, symbol>

        return self.rendererType.configSchema.create(
          {
            ...config,
            type: 'LinearMafRenderer',
          },
          getEnv(self),
        )
      },
    }))

    .views(self => ({
      /**
       * #getter
       */
      get root() {
        if (!self.volatileTree) {
          return undefined
        }

        let treeData = self.volatileTree

        // If subtree filter is active, find the subtree node
        if (self.subtreeFilter && self.subtreeFilter.length > 0) {
          const filterSet = new Set(self.subtreeFilter)

          const getLeafNames = (n: NodeWithIds): string[] =>
            !n.children?.length
              ? n.name
                ? [n.name]
                : []
              : n.children.flatMap(child => getLeafNames(child))

          const findSubtreeRoot = (
            node: NodeWithIds,
          ): NodeWithIds | undefined => {
            const leafNames = getLeafNames(node)
            if (
              leafNames.length === filterSet.size &&
              leafNames.every(name => filterSet.has(name))
            ) {
              return node
            }
            for (const child of node.children ?? []) {
              const found = findSubtreeRoot(child)
              if (found) {
                return found
              }
            }
            return undefined
          }

          const subtreeRoot = findSubtreeRoot(self.volatileTree)
          if (subtreeRoot) {
            treeData = subtreeRoot
          }
        }

        const root = hierarchy(treeData, d => d.children)
        sum(root, d => (d.children?.length ? 0 : 1))
        sort(root, (a, b) => (a.data.length || 1) - (b.data.length || 1))
        return root
      },
    }))
    .views(self => ({
      /**
       * #getter
       * generates a new tree that is clustered with x,y positions
       */
      get hierarchy(): HierarchyNode | undefined {
        const r = self.root
        if (!r) {
          return undefined
        }

        const width = self.treeAreaWidth

        // Assign y positions based on depth (root=0, leaves=width)
        assignDepthY(r, width)

        // Assign x positions for leaves at exact rowHeight multiples so they
        // align with the renderer's row positioning
        const leafNodes = leaves(r)
        for (let i = 0; i < leafNodes.length; i++) {
          leafNodes[i]!.x = i * self.rowHeight + self.rowHeight / 2
        }
        // Recompute internal node x as midpoint of first/last child (bottom-up)
        eachAfter(r, node => {
          if (node.children?.length) {
            node.x =
              (node.children[0]!.x! +
                node.children[node.children.length - 1]!.x!) /
              2
          }
        })

        r.data.length = 0
        setBrLength(r, 0, width / maxLength(r))
        return r
      },
      /**
       * #getter
       */
      get samples() {
        let samples: Sample[] | undefined
        if (this.rowNames) {
          const volatileSamplesMap = self.volatileSamples
            ? Object.fromEntries(self.volatileSamples.map(e => [e.id, e]))
            : undefined
          samples = normalize(this.rowNames).map(r => ({
            ...r,
            label: volatileSamplesMap?.[r.id]?.label ?? r.label,
            color: volatileSamplesMap?.[r.id]?.color ?? r.color,
          }))
        } else {
          samples = self.volatileSamples
        }

        if (samples && self.subtreeFilter) {
          const filterSet = new Set(self.subtreeFilter)
          return samples.filter(s => filterSet.has(s.id))
        }
        return samples
      },

      /**
       * #getter
       */
      get totalHeight() {
        return this.samples ? this.samples.length * self.rowHeight : 1
      },
      /**
       * #getter
       */
      get leaves() {
        return self.root ? leaves(self.root) : undefined
      },
      /**
       * #getter
       */
      get leafMap() {
        return new Map(this.leaves?.map(leaf => [leaf.data.name, leaf]))
      },
      /**
       * #getter
       * Precomputed map from hierarchy node to its descendant leaf names
       */
      get nodeDescendantNames() {
        if (this.hierarchy) {
          return computeNodeDescendantNames(this.hierarchy)
        }
        return new Map<HierarchyNode, string[]>()
      },
      /**
       * #getter
       */
      get rowNames(): string[] | undefined {
        return this.leaves?.map(n => n.data.name)
      },
    }))
    .views(self => {
      const {
        trackMenuItems: superTrackMenuItems,

        renderProps: superRenderProps,
      } = self
      return {
        /**
         * #getter
         */
        get treeWidth() {
          return self.hierarchy ? self.treeAreaWidth : 0
        },
        /**
         * #method
         */
        renderProps() {
          const {
            showAllLetters,
            rendererConfig,
            samples,
            rowHeight,
            rowProportion,
            mismatchRendering,
            showAsUpperCase,
          } = self
          const s = superRenderProps()
          return {
            ...s,
            notReady:
              (!self.volatileSamples && !self.volatileTree) || s.notReady,
            config: rendererConfig,
            samples,
            rowHeight,
            rowProportion,
            showAllLetters,
            mismatchRendering,
            showAsUpperCase,
          }
        },
        /**
         * #method
         */
        trackMenuItems() {
          return [
            ...superTrackMenuItems(),
            {
              label: 'Set feature height',
              type: 'subMenu',
              subMenu: [
                {
                  label: 'Normal',
                  onClick: () => {
                    self.setRowHeight(15)
                    self.setRowProportion(0.8)
                  },
                },
                {
                  label: 'Compact',
                  onClick: () => {
                    self.setRowHeight(8)
                    self.setRowProportion(0.9)
                  },
                },
                {
                  label: 'Manually set height',
                  onClick: () => {
                    getSession(self).queueDialog(handleClose => [
                      SetRowHeightDialog,
                      {
                        model: self,
                        handleClose,
                      },
                    ])
                  },
                },
              ],
            },
            {
              label: 'Show...',
              type: 'subMenu',
              subMenu: [
                {
                  label: 'Letters at all positions',
                  type: 'checkbox',
                  checked: self.showAllLetters,
                  onClick: () => {
                    self.setShowAllLetters(!self.showAllLetters)
                  },
                },
                {
                  label: 'Mismatches colored by base',
                  type: 'checkbox',
                  checked: self.mismatchRendering,
                  onClick: () => {
                    self.setMismatchRendering(!self.mismatchRendering)
                  },
                },
                {
                  label: 'Letters as uppercase',
                  type: 'checkbox',
                  checked: self.showAsUpperCase,
                  onClick: () => {
                    self.setShowAsUpperCase(!self.showAsUpperCase)
                  },
                },
                {
                  label: 'Sidebar with tree and labels',
                  type: 'checkbox',
                  checked: self.showSidebar,
                  onClick: () => {
                    self.setShowSidebar(!self.showSidebar)
                  },
                },
              ],
            },
            ...(self.subtreeFilter
              ? [
                  {
                    label: 'Clear subtree filter',
                    onClick: () => {
                      self.setSubtreeFilter(undefined)
                    },
                  },
                ]
              : []),
          ]
        },
      }
    })
    .views(self => ({
      /**
       * #getter
       * Get highlight regions from connected MSA views
       */
      get msaHighlights() {
        const session = getSession(self)
        const view = getContainingView(self)
        const highlights: { refName: string; start: number; end: number }[] = []

        // Find MSA views that are connected to our parent view
        for (const v of session.views) {
          if (
            (v as { type?: string }).type === 'MsaView' &&
            (v as { connectedViewId?: string }).connectedViewId === view.id
          ) {
            const msaView = v as {
              connectedHighlights?: {
                refName: string
                start: number
                end: number
              }[]
            }
            if (msaView.connectedHighlights) {
              for (const h of msaView.connectedHighlights) {
                highlights.push(h)
              }
            }
          }
        }
        return highlights
      },
      /**
       * #getter
       */
      get svgFontSize() {
        return Math.min(Math.max(self.rowHeight, 8), 14)
      },
      /**
       * #getter
       */
      get canDisplayLabel() {
        return self.rowHeight >= 7
      },
      /**
       * #getter
       */
      get labelWidth() {
        const minWidth = 20
        return max(
          self.samples
            ?.map(s => measureText(s.label, this.svgFontSize))
            .map(width => (this.canDisplayLabel ? width : minWidth)) || [],
          0,
        )
      },
      /**
       * #getter
       */
      get sidebarWidth() {
        return self.showSidebar ? this.labelWidth + 5 + self.treeWidth : 0
      },
    }))
    .actions(self => ({
      afterCreate() {
        addDisposer(
          self,
          autorun(async () => {
            try {
              const { rpcManager } = getSession(self)
              const sessionId = getRpcSessionId(self)
              self.setSamples(
                (await rpcManager.call(sessionId, 'MafGetSamples', {
                  sessionId,
                  adapterConfig: self.adapterConfig,
                  statusCallback: (message: string) => {
                    if (isAlive(self)) {
                      self.setStatusMessage(message)
                    }
                  },
                })) as { samples: Sample[]; tree: NodeWithIds | undefined },
              )
            } catch (e) {
              console.error(e)
              getSession(self).notifyError(`${e}`, e)
            }
          }),
        )
      },
    }))
    .actions(self => {
      const { renderSvg: superRenderSvg } = self
      return {
        /**
         * #action
         */
        async renderSvg(opts: ExportSvgDisplayOptions) {
          const { renderSvg } = await import('./renderSvg')
          return renderSvg(self, opts, superRenderSvg)
        },
      }
    })
    .postProcessSnapshot(snap => {
      const {
        rowHeight,
        rowProportion,
        showAllLetters,
        mismatchRendering,
        showBranchLen,
        treeAreaWidth,
        showAsUpperCase,
        showSidebar,
        subtreeFilter,
        ...rest
      } = snap as typeof snap & {
        rowHeight?: number
        rowProportion?: number
        showAllLetters?: boolean
        mismatchRendering?: boolean
        showBranchLen?: boolean
        treeAreaWidth?: number
        showAsUpperCase?: boolean
        showSidebar?: boolean
        subtreeFilter?: string[]
      }
      return {
        ...(rest as Omit<typeof rest, symbol>),
        ...(rowHeight !== defaultRowHeight ? { rowHeight } : {}),
        ...(rowProportion !== defaultRowProportion ? { rowProportion } : {}),
        ...(showAllLetters !== defaultShowAllLetters ? { showAllLetters } : {}),
        ...(mismatchRendering !== defaultMismatchRendering
          ? { mismatchRendering }
          : {}),
        ...(showBranchLen !== defaultShowBranchLen ? { showBranchLen } : {}),
        ...(treeAreaWidth !== defaultTreeAreaWidth ? { treeAreaWidth } : {}),
        ...(showAsUpperCase !== defaultShowAsUpperCase
          ? { showAsUpperCase }
          : {}),
        ...(showSidebar !== defaultShowSidebar ? { showSidebar } : {}),
        ...(subtreeFilter && subtreeFilter.length > 0 ? { subtreeFilter } : {}),
      }
    })
}

export type LinearMafDisplayStateModel = ReturnType<typeof stateModelFactory>
export type LinearMafDisplayModel = Instance<LinearMafDisplayStateModel>
