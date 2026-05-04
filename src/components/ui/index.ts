/**
 * Barrel export de componentes atómicos. Importar desde `@/components/ui`.
 *
 * Convención: cada archivo exporta un componente con el mismo nombre que el
 * archivo. Si un componente necesita tipos auxiliares, exportarlos también.
 */

export { Icon, type IconName, type IconProps } from './Icon';
export { AssetLogo } from './AssetLogo';
export { TagBadge } from './TagBadge';
export { BucketChip, BUCKET_LABEL } from './BucketChip';
export {
  Button,
  type ButtonVariant,
  type ButtonSize,
} from './Button';
export { KPI } from './KPI';
export { Field } from './Field';
