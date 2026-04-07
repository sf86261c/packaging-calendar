export type ProductCategory = 'cake' | 'cookie' | 'tube' | 'pineapple'

export type OrderStatus = '寄出' | '自取' | '送' | '豐原' | '待' | '延' | '到' | '取'

export type PaymentStatus = 'unpaid' | 'paid_printed' | 'paid'

export type InventoryType = 'inbound' | 'outbound' | 'adjustment'

export interface Product {
  id: string
  category: ProductCategory
  name: string
  sort_order: number
  is_active: boolean
}

export interface PackagingStyle {
  id: string
  name: string
  color_code: string
  is_active: boolean
}

export interface BrandingStyle {
  id: string
  name: string
  is_active: boolean
}

export interface Order {
  id: string
  order_date: string
  customer_name: string
  status: string
  batch_info: string | null
  packaging_id: string | null
  branding_id: string | null
  payment_status: PaymentStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  packaging_style?: PackagingStyle
  branding_style?: BrandingStyle
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

export interface PackagingMaterial {
  id: string
  name: string
  unit: string
  safety_stock: number
  is_active: boolean
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
  quantity_per_unit: number
  product?: Product
  material?: PackagingMaterial
}

// View models for UI
export interface DaySummary {
  date: string
  order_count: number
  cake_total: number
  cookie_total: number
  tube_total: number
  pending_count: number
  shipped_count: number
}

export interface WeeklyStats {
  week_number: number
  week_start: string
  week_end: string
  cake_original: number
  cake_black_tea: number
  cake_jasmine: number
  cookie_by_type: Record<string, number>
  packaging_by_style: Record<string, number>
}
