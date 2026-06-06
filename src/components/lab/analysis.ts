import { FACTOR_REGISTRY, type FactorDef, type RunPoint } from "../../experiments/labKit";
import { distinctValues } from "./explorer/explorerModel";

/** Factors that take ≥2 distinct values in the dataset (i.e. were swept in the
 *  test). Every result tool restricts its parameter choices to these, so the
 *  user only ever picks among the parameters their own test actually varied. */
export function getVaryingFactors(points: RunPoint[]): FactorDef[] {
  return FACTOR_REGISTRY.filter(
    (factor) => distinctValues(points, factor.id).length >= 2,
  );
}

export function labelForFactor(id: string): string {
  return FACTOR_REGISTRY.find((factor) => factor.id === id)?.label ?? id;
}
