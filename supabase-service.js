/**
 * ============================================================
 * AURA RENTAL — Supabase Service Layer
 * ============================================================
 *
 * This module abstracts all Supabase operations:
 * - Authentication (sign in, sign out, auth state)
 * - CRUD operations for all tables
 * - Realtime subscriptions
 * - Data normalization (Supabase ↔ app.js format)
 *
 * Usage:
 *   1. Set SUPABASE_URL and SUPABASE_ANON_KEY in window.APP_CONFIG
 *   2. Call SupabaseService.init() at app startup
 *   3. Use SupabaseService methods throughout the app
 */

// ============================================================
// CONFIGURATION
// ============================================================

const SUPABASE_URL = window.APP_CONFIG?.supabaseUrl || '';
const SUPABASE_ANON_KEY = window.APP_CONFIG?.supabaseKey || '';

// Create Supabase client
if (typeof window._supabaseClient === 'undefined') {
  window._supabaseClient = null;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}
var supabase = window._supabaseClient;

// ============================================================
// AUTH STATE
// ============================================================

let currentUser = null;
let currentProfile = null;
const authCallbacks = [];
let authInitialized = false;

/**
 * Initialize Supabase and check auth state
 * @returns {Promise<Object|null>} User object or null if not authenticated
 */
async function initAuth() {
  if (!supabase) {
    console.warn('Supabase not configured. Set APP_CONFIG first.');
    return null;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;

    if (currentUser) {
      await loadProfile();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      if (currentUser) {
        loadProfile();
      } else {
        currentProfile = null;
      }
      authCallbacks.forEach(cb => cb(currentUser, event));
    });

    authInitialized = true;
    return currentUser;
  } catch (err) {
    console.error('Auth init error:', err);
    return null;
  }
}

/**
 * Load current user's profile
 */
async function loadProfile() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (!error && data) {
      currentProfile = data;
    }
  } catch (err) {
    console.error('Load profile error:', err);
  }
}

/**
 * Sign in with email/password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} Auth data
 */
async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Sign up new user
 * @param {string} email
 * @param {string} password
 * @param {Object} metadata
 * @returns {Promise<Object>} Auth data
 */
async function signUp(email, password, metadata = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out current user
 */
async function signOut() {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentUser = null;
  currentProfile = null;
}

/**
 * Get current authenticated user
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * Get current user's profile
 */
function getCurrentProfile() {
  return currentProfile;
}

/**
 * Register callback for auth state changes
 * @param {Function} callback - (user, event) => void
 */
function onAuthChange(callback) {
  authCallbacks.push(callback);
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  return !!currentUser;
}

// ============================================================
// DRESS OPERATIONS
// ============================================================

/**
 * Fetch all dresses (not deleted)
 */
async function fetchDresses() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('dresses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  // Filter deleted items in JS (Supabase .is() filter has issues)
  return (data || []).filter(d => !d.deleted_at).map(normalizeDress);
}

/**
 * Create new dress
 * @param {Object} dress - Dress data in app.js format
 */
async function createDress(dress) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('dresses')
    .insert([{
      ma_vay: dress.Ma_Vay,
      ten_vay: dress.Ten_Vay,
      size: dress.Size,
      gia_vay_goc: dress.Gia_Vay_Goc || 0,
      gia_thue_12h: dress.Gia_Thue_12h || 0,
      gia_thue_1_ngay: dress.Gia_Thue_1_Ngay || 0,
      gia_thue_3_ngay: dress.Gia_Thue_3_Ngay || 0,
      anh_vay: dress.Anh_Vay || '',
      ghi_chu: dress.Ghi_Chu || '',
      so_lan_thue: dress.So_Lan_Thue || 0,
      created_by: currentUser?.id
    }])
    .select()
    .single();

  if (error) throw error;
  return normalizeDress(data);
}

/**
 * Update dress
 * @param {string} id - Dress UUID
 * @param {Object} updates - Fields to update in app.js format
 */
async function updateDress(id, updates) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('dresses')
    .update({
      ten_vay: updates.Ten_Vay,
      size: updates.Size,
      gia_vay_goc: updates.Gia_Vay_Goc,
      gia_thue_12h: updates.Gia_Thue_12h,
      gia_thue_1_ngay: updates.Gia_Thue_1_Ngay,
      gia_thue_3_ngay: updates.Gia_Thue_3_Ngay,
      anh_vay: updates.Anh_Vay,
      ghi_chu: updates.Ghi_Chu,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalizeDress(data);
}

/**
 * Soft delete dress
 * @param {string} id - Dress UUID
 */
async function deleteDress(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('dresses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Increment dress rental count
 * @param {string} id - Dress UUID
 */
async function incrementDressRentalCount(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.rpc('increment_rental_count', { dress_id: id });
  if (error) {
    // Fallback: fetch, increment, update
    const { data } = await supabase.from('dresses').select('so_lan_thue').eq('id', id).single();
    await supabase.from('dresses').update({ so_lan_thue: (data?.so_lan_thue || 0) + 1 }).eq('id', id);
  }
}

// ============================================================
// ACCESSORY OPERATIONS
// ============================================================

/**
 * Fetch all accessories (not deleted)
 */
async function fetchAccessories() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('accessories')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  // Filter deleted items in JS (Supabase .is() filter has issues)
  return (data || []).filter(a => !a.deleted_at).map(normalizeAccessory);
}

/**
 * Create new accessory
 * @param {Object} acc - Accessory data in app.js format
 */
async function createAccessory(acc) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('accessories')
    .insert([{
      ma_pk: acc.Ma_PK,
      ten_pk: acc.Ten_PK,
      loai: acc.Loai,
      so_luong_tong: acc.So_Luong_Tong || 1,
      gia_thue_12h: acc.Gia_Thue_12h || 0,
      gia_thue_1_ngay: acc.Gia_Thue_1_Ngay || 0,
      gia_thue_3_ngay: acc.Gia_Thue_3_Ngay || 0,
      anh_pk: acc.Anh_PK || '',
      ghi_chu: acc.Ghi_Chu || '',
      created_by: currentUser?.id
    }])
    .select()
    .single();

  if (error) throw error;
  return normalizeAccessory(data);
}

/**
 * Update accessory
 * @param {string} id - Accessory UUID
 * @param {Object} updates - Fields to update
 */
async function updateAccessory(id, updates) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('accessories')
    .update({
      ten_pk: updates.Ten_PK,
      loai: updates.Loai,
      so_luong_tong: updates.So_Luong_Tong,
      gia_thue_12h: updates.Gia_Thue_12h,
      gia_thue_1_ngay: updates.Gia_Thue_1_Ngay,
      gia_thue_3_ngay: updates.Gia_Thue_3_Ngay,
      anh_pk: updates.Anh_PK,
      ghi_chu: updates.Ghi_Chu,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalizeAccessory(data);
}

/**
 * Soft delete accessory
 * @param {string} id - Accessory UUID
 */
async function deleteAccessory(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('accessories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ============================================================
// ORDER OPERATIONS
// ============================================================

/**
 * Fetch all orders (not deleted)
 * Includes dress and accessory relations
 */
async function fetchOrders() {
  if (!supabase) throw new Error('Supabase not configured');

  // Fetch orders
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('*')
    .order('ngay_lay', { ascending: false });

  if (ordersErr) throw ordersErr;

  // Filter deleted items in JS (Supabase .is() filter has issues)
  const activeOrders = (orders || []).filter(o => !o.deleted_at);
  if (!activeOrders?.length) return [];

  // Fetch relations
  const orderIds = activeOrders.map(o => o.id);

  const [dhvsResult, pksResult] = await Promise.all([
    supabase.from('order_dresses').select('*').in('order_id', orderIds),
    supabase.from('order_accessories').select('*').in('order_id', orderIds)
  ]);

  // Build maps
  const dhvMap = {};
  (dhvsResult.data || []).forEach(d => {
    if (!dhvMap[d.order_id]) dhvMap[d.order_id] = [];
    dhvMap[d.order_id].push({ id: d.id, dress_id: d.dress_id });
  });

  const pkMap = {};
  (pksResult.data || []).forEach(p => {
    if (!pkMap[p.order_id]) pkMap[p.order_id] = [];
    pkMap[p.order_id].push(p.accessory_id);
  });

  return activeOrders.map(o => normalizeOrder(o, dhvMap[o.id] || [], pkMap[o.id] || []));
}

/**
 * Create new order
 * @param {Object} order - Order data in app.js format
 */
async function createOrder(order) {
  if (!supabase) throw new Error('Supabase not configured');

  const { dhvs, pks, ...orderData } = order;

  // Insert order
  const { data: newOrder, error: orderErr } = await supabase
    .from('orders')
    .insert([{
      ma_don: orderData.Ma_Don,
      trang_thai_don: orderData.Trang_Thai_Don || 'Chốt thuê',
      insta_khach: orderData.Insta_Khach || '',
      sdt: orderData.SDT || '',
      goi_thue: orderData.Goi_Thue,
      ngay_lay: orderData.Ngay_Lay,
      gio_lay: orderData.Gio_Lay || '09:00',
      ngay_tra: orderData.Ngay_Tra,
      hinh_thuc_coc: orderData.Hinh_Thuc_Coc || '',
      hinh_thuc_nhan: orderData.Hinh_Thuc_Nhan || '',
      dia_chi: orderData.Dia_Chi || '',
      su_kien: orderData.Su_Kien || '',
      ghi_chu: orderData.Ghi_Chu || '',
      chi_phi_khac: orderData.Chi_Phi_Khac || 0,
      trang_thai_hoan_coc: orderData.Trang_Thai_Hoan_Coc || false,
      thoi_gian_hoan_coc: orderData.Thoi_Gian_Hoan_Coc || null,
      ngay_tao: orderData.Ngay_Tao || new Date().toISOString(),
      created_by: currentUser?.id
    }])
    .select()
    .single();

  if (orderErr) throw orderErr;

  // Insert dress relations
  if (dhvs?.length) {
    const dressInserts = dhvs
      .filter(d => d.dress_id || d.vay)
      .map(d => ({
        order_id: newOrder.id,
        dress_id: d.dress_id || d.vay
      }));

    if (dressInserts.length) {
      await supabase.from('order_dresses').insert(dressInserts);
    }
  }

  // Insert accessory relations
  if (pks?.length) {
    const accInserts = pks
      .filter(a => a)
      .map(a => ({
        order_id: newOrder.id,
        accessory_id: typeof a === 'string' ? a : a.Ma_PK
      }));

    if (accInserts.length) {
      await supabase.from('order_accessories').insert(accInserts);
    }
  }

  return { ...normalizeOrder(newOrder, dhvs || [], pks || []), id: newOrder.id };
}

/**
 * Update order
 * @param {string} id - Order UUID
 * @param {Object} updates - Fields to update
 */
async function updateOrder(id, updates) {
  if (!supabase) throw new Error('Supabase not configured');

  const { dhvs, pks, ...orderData } = updates;

  // Update order fields
  const { error: orderErr } = await supabase
    .from('orders')
    .update({
      trang_thai_don: orderData.Trang_Thai_Don,
      insta_khach: orderData.Insta_Khach,
      sdt: orderData.SDT,
      goi_thue: orderData.Goi_Thue,
      ngay_lay: orderData.Ngay_Lay,
      gio_lay: orderData.Gio_Lay,
      ngay_tra: orderData.Ngay_Tra,
      hinh_thuc_coc: orderData.Hinh_Thuc_Coc,
      hinh_thuc_nhan: orderData.Hinh_Thuc_Nhan,
      dia_chi: orderData.Dia_Chi,
      su_kien: orderData.Su_Kien,
      ghi_chu: orderData.Ghi_Chu,
      chi_phi_khac: orderData.Chi_Phi_Khac,
      trang_thai_hoan_coc: orderData.Trang_Thai_Hoan_Coc,
      thoi_gian_hoan_coc: orderData.Thoi_Gian_Hoan_Coc,
    })
    .eq('id', id);

  if (orderErr) throw orderErr;

  // Update dress relations if provided
  if (dhvs !== undefined) {
    await supabase.from('order_dresses').delete().eq('order_id', id);
    if (dhvs?.length) {
      await supabase.from('order_dresses').insert(
        dhvs
          .filter(d => d.dress_id || d.vay)
          .map(d => ({ order_id: id, dress_id: d.dress_id || d.vay }))
      );
    }
  }

  // Update accessory relations if provided
  if (pks !== undefined) {
    await supabase.from('order_accessories').delete().eq('order_id', id);
    if (pks?.length) {
      await supabase.from('order_accessories').insert(
        pks
          .filter(a => a)
          .map(a => ({ order_id: id, accessory_id: typeof a === 'string' ? a : a.Ma_PK }))
      );
    }
  }
}

/**
 * Soft delete order
 * @param {string} id - Order UUID
 */
async function deleteOrder(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('orders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ============================================================
// PAYMENT OPERATIONS
// ============================================================

/**
 * Fetch all payments
 */
async function fetchPayments() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizePayment);
}

/**
 * Create payment
 * @param {Object} payment - Payment data in app.js format
 */
async function createPayment(payment) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('payments')
    .insert([{
      ma_tt: payment.Ma_TT,
      order_id: payment.order_id || payment.Ma_Don,
      ngay_tt: payment.Ngay_TT || payment.ngay,
      tien_coc: payment.Tien_Coc || 0,
      chi_phi_khac: payment.Chi_Phi_Khac || 0,
      ghi_chu: payment.Ghi_Chu || ''
    }])
    .select()
    .single();

  if (error) throw error;
  return normalizePayment(data);
}

// ============================================================
// BOOKING OPERATIONS
// ============================================================

/**
 * Fetch pending bookings with dress/accessory relations
 */
async function fetchBookings() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const bookings = data || [];

  if (bookings.length === 0) return bookings;

  // Fetch dress relations
  const bookingIds = bookings.map(b => b.id);
  const [dressesResult, accsResult] = await Promise.all([
    supabase.from('booking_dresses').select('*').in('booking_id', bookingIds),
    supabase.from('booking_accessories').select('*').in('booking_id', bookingIds)
  ]);

  // Build maps
  const dressMap = {};
  (dressesResult.data || []).forEach(d => {
    if (!dressMap[d.booking_id]) dressMap[d.booking_id] = [];
    dressMap[d.booking_id].push(d.dress_id);
  });
  const accMap = {};
  (accsResult.data || []).forEach(a => {
    if (!accMap[a.booking_id]) accMap[a.booking_id] = [];
    accMap[a.booking_id].push(a.accessory_id);
  });

  // Attach relations to bookings
  bookings.forEach(b => {
    b._dressIds = dressMap[b.id] || [];
    b._accIds = accMap[b.id] || [];
  });

  return bookings;
}

/**
 * Create booking (from booking-form.html)
 * @param {Object} booking - Booking data
 */
async function createBooking(booking) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('bookings')
    .insert([{
      ma_booking: booking.ma_booking || 'B' + Date.now(),
      insta_khach: booking.insta_khach || '',
      sdt: booking.sdt,
      goi_thue: booking.goi_thue,
      ngay_lay: booking.ngay_lay,
      gio_lay: booking.gio_lay || '09:00',
      hinh_thuc_nhan: booking.hinh_thuc_nhan,
      hinh_thuc_coc: booking.hinh_thuc_coc,
      dia_chi: booking.dia_chi || '',
      su_kien: booking.su_kien || '',
      ghi_chu: booking.ghi_chu || ''
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update booking status
 * @param {string} id - Booking UUID
 * @param {string} status - 'pending', 'converted', 'cancelled'
 * @param {string} orderId - Optional order ID if converted
 */
async function updateBookingStatus(id, status, orderId = null) {
  if (!supabase) throw new Error('Supabase not configured');

  const updates = { trang_thai: status };
  if (orderId) updates.converted_order_id = orderId;

  const { error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

// ============================================================
// REALTIME SUBSCRIPTIONS
// ============================================================

let realtimeSubscriptions = [];

/**
 * Subscribe to changes on a table
 * @param {string} table - Table name
 * @param {Function} callback - (payload) => void
 * @returns {Object} Subscription object
 */
function subscribeToChanges(table, callback) {
  if (!supabase) {
    console.warn('Supabase not configured - realtime disabled');
    return null;
  }

  const subscription = supabase
    .channel(`${table}-changes-${Date.now()}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table },
      payload => {
        console.log(`[Realtime] ${table}:`, payload.eventType);
        callback(payload);
      }
    )
    .subscribe();

  realtimeSubscriptions.push(subscription);
  return subscription;
}

/**
 * Subscribe to all table changes
 * @param {Object} callbacks - { tableName: callbackFn }
 */
function subscribeToAll(callbacks) {
  Object.entries(callbacks).forEach(([table, callback]) => {
    subscribeToChanges(table, callback);
  });
}

/**
 * Unsubscribe from all realtime channels
 */
function unsubscribeAll() {
  realtimeSubscriptions.forEach(sub => {
    if (sub?.unsubscribe) sub.unsubscribe();
  });
  realtimeSubscriptions = [];
}

// ============================================================
// DATA NORMALIZATION
// Convert Supabase format → app.js expected format
// ============================================================

function normalizeDress(d) {
  if (!d) return null;
  return {
    id: d.id,
    _dbId: d.id,
    Ma_Vay: d.ma_vay,
    Ten_Vay: d.ten_vay,
    Size: d.size,
    Gia_Vay_Goc: d.gia_vay_goc,
    Gia_Thue_12h: d.gia_thue_12h,
    Gia_Thue_1_Ngay: d.gia_thue_1_ngay,
    Gia_Thue_3_Ngay: d.gia_thue_3_ngay,
    Anh_Vay: d.anh_vay,
    Ghi_Chu: d.ghi_chu,
    So_Lan_Thue: d.so_lan_thue || 0,
    _ts: new Date(d.updated_at).getTime()
  };
}

function normalizeAccessory(a) {
  if (!a) return null;
  return {
    id: a.id,
    _dbId: a.id,
    Ma_PK: a.ma_pk,
    Ten_PK: a.ten_pk,
    Loai: a.loai,
    So_Luong_Tong: a.so_luong_tong,
    Gia_Thue_12h: a.gia_thue_12h,
    Gia_Thue_1_Ngay: a.gia_thue_1_ngay,
    Gia_Thue_3_Ngay: a.gia_thue_3_ngay,
    Anh_PK: a.anh_pk,
    Ghi_Chu: a.ghi_chu,
    _ts: new Date(a.updated_at).getTime()
  };
}

function normalizeOrder(o, dhvs = [], pkIds = []) {
  if (!o) return null;
  return {
    id: o.id,
    _dbId: o.id,
    Ma_Don: o.ma_don,
    Trang_Thai_Don: o.trang_thai_don,
    Insta_Khach: o.insta_khach,
    SDT: o.sdt,
    Goi_Thue: o.goi_thue,
    Ngay_Lay: o.ngay_lay,
    Gio_Lay: o.gio_lay,
    Ngay_Tra: o.ngay_tra,
    Hinh_Thuc_Coc: o.hinh_thuc_coc,
    Hinh_Thuc_Nhan: o.hinh_thuc_nhan,
    Dia_Chi: o.dia_chi,
    Su_Kien: o.su_kien,
    Ghi_Chu: o.ghi_chu,
    Chi_Phi_Khac: o.chi_phi_khac,
    Trang_Thai_Hoan_Coc: o.trang_thai_hoan_coc,
    Thoi_Gian_Hoan_Coc: o.thoi_gian_hoan_coc,
    Ngay_Tao: o.ngay_tao,
    dhvs: dhvs.map(d => ({
      id: d.id,
      vay: d.dress_id
    })),
    Ma_PK: pkIds,
    hoan: o.trang_thai_hoan_coc,
    time_hoan: o.thoi_gian_hoan_coc,
    _ts: new Date(o.updated_at).getTime()
  };
}

function normalizePayment(p) {
  if (!p) return null;
  return {
    id: p.id,
    _dbId: p.id,
    Ma_TT: p.ma_tt,
    Ngay_TT: p.ngay_tt,
    Ma_Don: p.order_id,
    order_id: p.order_id,
    Tien_Coc: p.tien_coc,
    Chi_Phi_Khac: p.chi_phi_khac,
    Ghi_Chu: p.ghi_chu,
    _ts: new Date(p.updated_at).getTime()
  };
}

function normalizeBooking(b, dressMap = {}, accMap = {}) {
  if (!b) return null;
  return {
    id: b.id,
    _dbId: b.id,
    Ma_Don: b.ma_booking,
    Ma_Booking: b.ma_booking,
    Trang_Thai_Don: 'Chờ xác nhận',
    Insta_Khach: b.insta_khach,
    SDT: b.sdt,
    Insta: b.insta_khach,
    Goi_Thue: b.goi_thue,
    Ngay_Lay: b.ngay_lay,
    Gio_Lay: b.gio_lay,
    Ngay_Tra: b.ngay_tra,
    Hinh_Thuc_Coc: b.hinh_thuc_coc,
    Hinh_Thuc_Nhan: b.hinh_thuc_nhan,
    Dia_Chi: b.dia_chi,
    Su_Kien: b.su_kien,
    Ghi_Chu: b.ghi_chu,
    _ts: new Date(b.created_at).getTime(),
    _fromBooking: true,
    _dressIds: b._dressIds || [],
    _accIds: b._accIds || [],
    // Build dhvs with Ma_Vay for donTenVay() to find
    dhvs: (b._dressIds || []).map(dressId => {
      const dress = dressMap[dressId];
      return {
        vay: dressId,
        Ma_Vay: dressId
      };
    }),
    Ma_PK: b._accIds || []
  };
}

// ============================================================
// EXPORT
// ============================================================

window.SupabaseService = {
  // Config
  isConfigured: () => !!supabase,

  // Auth
  init: initAuth,
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  getCurrentProfile,
  onAuthChange,
  isAuthenticated,

  // Dresses
  fetchDresses,
  createDress,
  updateDress,
  deleteDress,
  incrementDressRentalCount,

  // Accessories
  fetchAccessories,
  createAccessory,
  updateAccessory,
  deleteAccessory,

  // Orders
  fetchOrders,
  createOrder,
  updateOrder,
  deleteOrder,

  // Payments
  fetchPayments,
  createPayment,

  // Bookings
  fetchBookings,
  createBooking,
  updateBookingStatus,
  normalizeBooking,

  // Realtime
  subscribeToChanges,
  subscribeToAll,
  unsubscribeAll,

  // Normalization
  normalizeDress,
  normalizeAccessory,
  normalizeOrder,
  normalizePayment
};

console.log('✅ SupabaseService loaded');
