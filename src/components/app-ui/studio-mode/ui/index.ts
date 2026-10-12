/**
 * Keplar Studio design system. Import from "@/components/app-ui/studio-mode/ui".
 * Docs: ./README.md. Every Studio screen renders inside <StudioRoot>.
 */
export { StudioRoot, studioRootClass, srOnly, type StudioRootProps, type StudioTheme } from "./StudioRoot";
export { useReducedMotion, useHydrated } from "./hooks";
export { DURATION, EASING, springLinear, type DurationToken, type EasingToken } from "./motion";
export { cx } from "./cx";

export { Button, IconButton, type ButtonProps, type ButtonVariant, type ControlSize, type IconButtonProps } from "./Button";
export { Switch, Checkbox, type SwitchProps, type CheckboxProps } from "./Toggles";
export { Badge, StatusDot, type BadgeProps, type StatusDotProps, type Tone, type Status } from "./Badge";
export { Kbd, KeyCombo, useKeyPlatform, type KbdProps } from "./Kbd";
export { formatKey, spokenKey, detectPlatform, type KeyPlatform } from "./keys";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { Popover, Menu, MenuItem, MenuSeparator, MenuLabel, type PopoverProps, type MenuProps, type MenuItemProps, type MenuTriggerProps } from "./Menu";
export {
  SegmentedControl,
  Tabs,
  TabPanel,
  Panel,
  PanelHeader,
  PanelBody,
  INSPECTOR_TABS,
  INSPECTOR_TAB_LABELS,
  tabId,
  tabPanelId,
  type SegmentOption,
  type SegmentedControlProps,
  type TabItem,
  type TabsProps,
  type TabPanelProps,
  type InspectorTab,
  type PanelProps,
  type PanelHeaderProps,
} from "./Layout";
export { ResizableSplit, type ResizableSplitProps } from "./ResizableSplit";
export { SPLIT_STORAGE_PREFIX, type SplitValue, type SplitBounds, type SplitCollapsible } from "./split-storage";
export { ToastProvider, useToast, type ToastApi, type ToastOptions, type ToastTone, type ToastProviderProps } from "./Toast";
export { Dialog, type DialogProps } from "./Dialog";
export { progressRatio, defaultToastDuration } from "./feedback-logic";
export { Progress, ActivityIndicator, EmptyState, type ProgressProps, type ActivityIndicatorProps, type EmptyStateProps } from "./Feedback";
export { computePlacement, type Side, type Align, type Placement } from "./position";

export { Icon, type IconProps } from "./icons/Icon";
export { GLYPHS, ICON_NAMES, type IconName } from "./icons/glyphs";
export { MorphIcon, type MorphIconProps } from "./icons/MorphIcon";
export { MORPH_ICONS, MORPH_ICON_NAMES, morphStates, type MorphIconName, type MorphIconState, type MorphStateDef } from "./icons/morph-paths";
export { UltimateMark, type UltimateMarkProps } from "./UltimateMark";
