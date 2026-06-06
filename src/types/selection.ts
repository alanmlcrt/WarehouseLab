import type { EntityId, GridPosition } from "../simulation/models/types";

export type SelectionType =
  | "robot"
  | "station"
  | "rack"
  | "cell"
  | "charger"
  | "elevator"
  | "connector";

export interface SceneSelection {
  type: SelectionType;
  id: EntityId;
  position?: GridPosition;
}
