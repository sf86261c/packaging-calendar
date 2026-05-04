export type ProductCategory = 'cake' | 'cake_bar' | 'cookie' | 'tube' | 'tube_pkg' | 'single_cake'

export type InventoryType = 'inbound' | 'outbound' | 'adjustment'

export interface Product {
  id: string
  category: ProductCategory
  name: string
  sort_order: number
  is_active: boolean
  is_common: boolean
}

export interface PackagingStyle {
  id: string
  name: string
  color_code: string
  category: string | null
  is_active: boolean
}

export interface BrandingStyle {
  id: string
  name: string
  category: string | null
  is_active: boolean
}

export interface Order {
  id: string
  order_date: string
  customer_name: string
  status: string
  batch_info: string | null
  printed: boolean
  paid: boolean
  // Per-category packaging/branding
  cake_packaging_id: string | null
  cake_branding_id: string | null
  tube_packaging_id: string | null
  single_cake_packaging_id: string | null
  single_cake_branding_text: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  cake_packaging?: PackagingStyle
  cake_branding?: BrandingStyle
  tube_packaging?: PackagingStyle
  single_cake_packaging?: PackagingStyle
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  product?: Product
}

export interface InventoryRecord {
  id: string
  product_id: string
  date: string
  type: InventoryType
  quantity: number
  reference_note: string | null
  created_by: string | null
  created_at: string
  product?: Product
}

export interface PackagingMaterialCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface PackagingMaterial {
  id: string
  name: string
  unit: string
  safety_stock: number
  is_active: boolean
  category_id: string | null
  sort_order: number
}

export interface PackagingMaterialInventory {
  id: string
  material_id: string
  date: string
  type: InventoryType
  quantity: number
  reference_note: string | null
  created_by: string | null
  created_at: string
  material?: PackagingMaterial
}

export interface ProductMaterialUsage {
  id: string
  product_id: string
  material_id: string
  packaging_style_id: string | null
  quantity_per_unit: number
  product?: Product
  material?: PackagingMaterial
}

export interface DaySummary {
  date: string
  order_count: number
  cake_total: number
  cookie_total: number
  tube_total: number
  pending_count: number
}

export type AdjustmentType = 'sample' | 'waste' | 'retail'
export type DeductMode = 'finished' | 'ingredient'

export interface ProductRecipe {
  id: string
  product_id: string
  ingredient_id: string
  quantity_per_unit: number
  created_at: string
  ingredient?: Product
}

export interface StockAdjustment {
  id: string
  date: string
  adjustment_type: AdjustmentType
  note: string | null
  created_at: string
  items?: StockAdjustmentItem[]
}

export interface StockAdjustmentItem {
  id: string
  adjustment_id: string
  product_id: string | null
  material_id: string | null
  quantity: number
  deduct_mode: DeductMode
  packaging_style_id: string | null
  product?: Product
  material?: PackagingMaterial
}
