-- Migration 006: 蜂蜜蛋糕(盒) 新增單口味品項
-- 經典原味、伯爵紅茶、茉莉花茶（1盒 = 2條同口味 cake_bar）

INSERT INTO products (category, name, sort_order, is_active) VALUES
  ('cake', '經典原味', 13, true),
  ('cake', '伯爵紅茶', 14, true),
  ('cake', '茉莉花茶', 15, true);
