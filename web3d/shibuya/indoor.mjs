// Phase 2 contracts only. No assets, renderer, worker or random stream are touched.
// See docs/phase2-indoor.md for the proposed data and integration rules.

/** @typedef {'outdoor_top'|'building_zoom'|'plan_rise'|'indoor_flow'|'store_detail'} IndoorScene */
/** @typedef {[number, number]} Point2 Metres in the building's local x/z plane. */
/** @typedef {Point2[]} Ring Unclosed polygon; the final edge returns to the first vertex. */
/** @typedef {{id: string, elevation_m: number, height_m: number, outline: Ring}} IndoorFloor */
/** @typedef {{id: string, floor_id: string, kind: 'concourse'|'tenant'|'popup', polygon: Ring}} IndoorZone */
/** @typedef {{id: string, name: string, zone_id: string, entry_node_id: string, entry_width_m: number}} IndoorTenant */
/** @typedef {{id: string, floor_id: string|null, position_m: Point2}} IndoorNode */
/** @typedef {{from: string, to: string, width_m: number, bidirectional: boolean}} IndoorEdge */
/**
 * @typedef {Object} IndoorPortal
 * @property {string} id
 * @property {'entrance'|'escalator'|'lift'} kind
 * @property {string} from_node
 * @property {string} to_node
 * @property {number} width_m
 * @property {number} capacity_per_s
 * @property {number} travel_s
 * @property {boolean} bidirectional
 * @property {boolean} accessible
 */
/**
 * @typedef {Object} IndoorAd
 * @property {string} id
 * @property {string} floor_id
 * @property {Point2} position_m
 * @property {number} heading_deg 0 faces +x; 90 faces +z.
 * @property {number} fov_deg Full viewing cone.
 * @property {number} range_m
 * @property {number} min_exposure_s Continuous visible time required for reach.
 */
/**
 * @typedef {Object} IndoorStoreDetail
 * @property {string} tenant_id
 * @property {{id: string, position_m: Point2}[]} seats
 * @property {{capacity: number, path_m: Point2[], service_mean_s: number}} queue
 * @property {{sku: string, initial_units: number, units_per_checkout: number, restocks: {time_s: number, units: number}[]}[]} inventory
 */
/**
 * @typedef {Object} IndoorFloorplan
 * @property {1} schema_version
 * @property {string} id
 * @property {{kind: 'self_authored_fictional', real_facility_plan: false}} provenance
 * @property {'m'} units
 * @property {Point2} origin_world_m Translation into the outdoor x/z frame; no rotation.
 * @property {IndoorFloor[]} floors
 * @property {IndoorZone[]} zones
 * @property {IndoorTenant[]} tenants
 * @property {{nodes: IndoorNode[], edges: IndoorEdge[]}} navigation
 * @property {IndoorPortal[]} portals
 * @property {IndoorAd[]} ads
 * @property {IndoorStoreDetail|null} store_detail
 * @property {{duration_s: number, seeds: number[], scenarios: {id: string, active_popup_ids: string[], active_ad_ids: string[]}[]}} experiment
 */
/**
 * Future tick-boundary ownership transfer; this module does not perform it.
 * @typedef {Object} IndoorHandoff
 * @property {string} transfer_id Idempotency key for retries.
 * @property {number} agent_id Stable outdoor identity, weight one.
 * @property {string} portal_id
 * @property {'outdoor'|'indoor'} destination
 * @property {number} time_s Simulation time, independent of the signal clock.
 * @property {number} random_state
 * @property {number} funnel_state
 * @property {Point2} velocity_m_s
 * @property {string} resume_node_id Outdoor routing goal on return.
 */
/**
 * @typedef {Object} IndoorOptions
 * @property {boolean} enabled Reserved opt-in; the current stub remains inactive.
 * @property {IndoorFloorplan|null} floorplan Data, never a network URL.
 * @property {boolean} storeDetail
 */

/** @type {Readonly<IndoorOptions>} */
export const INDOOR_DEFAULTS=Object.freeze({enabled:false,floorplan:null,storeDetail:false});

/**
 * Reserved scene-switch hook. Always declines, including an enabled request.
 * Future implementation must validate data before accepting a transition.
 * @param {IndoorScene} _target
 * @param {Readonly<IndoorOptions>} [_options]
 * @returns {boolean} Whether a transition was accepted (currently always false).
 */
export function requestIndoorScene(_target,_options=INDOOR_DEFAULTS){return false;}
