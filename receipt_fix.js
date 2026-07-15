// Receipt function replacement script
// Run: node receipt_fix.js in the project directory

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the function and replace it
const startMarker = 'function showRefundScreenshot(o, coc, tong, cp, hoan) {';
const endMarker = '\n\n/* ============================================================\n *  NEW ORDER MODAL';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find function markers');
  process.exit(1);
}

const newFunction = `function showRefundScreenshot(o, coc, tong, cp, hoan) {
  const id = o.Ma_Don || o.id || '';
  const ins = o.Insta_Khach || o.insta || '';
  const sdt = o.SDT || o.sdt || '';
  const goi = o.Goi_Thue || o.goi || '';
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayLayDisplay = isoToVN(ngayLay);
  const ngayTraDisplay = ngayTraThuc(goi, ngayLay) ? isoToVN(ngayTraThuc(goi, ngayLay)) : '—';
  const ngayHoan = new Date().toLocaleString('vi-VN');
  const loaiCoc = o.Hinh_Thuc_Coc || o.coc || '';

  // Build detailed items with prices
  const g = goi === '12h' ? 'Gia_Thue_12h' : goi === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay';
  let itemsHtml = '';

  if (o.dhvs && o.dhvs.length > 0) {
    o.dhvs.forEach((dhv) => {
      const v = db.vay.find(x => (x.Ma_Vay || x.ma) === (dhv.vay || dhv.Ma_Vay));
      if (v) {
        const ten = v.Ten_Vay || v.ten || '';
        const gia = v[g] || 0;
        itemsHtml += '<div class="rcpt-item"><div class="rcpt-item-left"><span class="rcpt-item-name">' + escapeHtml(ten) + '</span><span class="rcpt-item-size">Size ' + (v.Size || v.size || '-') + '</span></div><span class="rcpt-item-price">' + fmtVND(gia) + '</span></div>';
      }
    });
  }

  const pkIds = o.Ma_PK || o.pks || [];
  pkIds.forEach(pkId => {
    const p = db.pk.find(x => (x.Ma_PK || x.ma) === pkId);
    if (p) {
      const ten = p.Ten_PK || p.ten || '';
      const gia = p[g] || 0;
      itemsHtml += '<div class="rcpt-item"><div class="rcpt-item-left"><span class="rcpt-item-name">' + escapeHtml(ten) + '</span><span class="rcpt-item-size">Phụ kiện</span></div><span class="rcpt-item-price">' + fmtVND(gia) + '</span></div>';
    }
  });

  if (!itemsHtml) itemsHtml = '<div class="rcpt-item-empty">Không có thông tin</div>';

  const refundCardHTML = \`
    <div class="receipt-card" id="refund-screenshot">
      <div class="receipt-header">
        <div class="receipt-brand">AURA RENTAL</div>
        <div class="receipt-subtitle">Phiếu hoàn cọc</div>
      </div>
      <div class="receipt-body">
        <div class="receipt-section">
          <div class="receipt-section-title">Thông tin đơn</div>
          <div class="receipt-row"><span class="receipt-label">Mã đơn</span><span class="receipt-value receipt-id">\${id}</span></div>
          <div class="receipt-row"><span class="receipt-label">Ngày hoàn</span><span class="receipt-value">\${ngayHoan}</span></div>
        </div>
        <div class="receipt-section">
          <div class="receipt-section-title">Khách hàng</div>
          <div class="receipt-row"><span class="receipt-label">Tên</span><span class="receipt-value">\${escapeHtml(ins) || '-'}</span></div>
          <div class="receipt-row"><span class="receipt-label">Điện thoại</span><span class="receipt-value">\${escapeHtml(sdt) || '-'}</span></div>
        </div>
        <div class="receipt-section">
          <div class="receipt-section-title">Danh sách sản phẩm</div>
          <div class="receipt-items">\${itemsHtml}</div>
        </div>
        <div class="receipt-section">
          <div class="receipt-section-title">Chi tiết thuê</div>
          <div class="receipt-row"><span class="receipt-label">Gói thuê</span><span class="receipt-value">\${goi}</span></div>
          <div class="receipt-row"><span class="receipt-label">Ngày lấy</span><span class="receipt-value">\${ngayLayDisplay}</span></div>
          <div class="receipt-row"><span class="receipt-label">Ngày trả</span><span class="receipt-value">\${ngayTraDisplay}</span></div>
          <div class="receipt-row"><span class="receipt-label">Hình thức cọc</span><span class="receipt-value">\${loaiCoc}</span></div>
        </div>
        <div class="receipt-section receipt-summary-section">
          <div class="receipt-section-title">Thanh toán</div>
          <div class="receipt-calc-row"><span>Tiền cọc</span><span class="rcpt-green">\${fmtVND(coc)}</span></div>
          <div class="receipt-calc-row"><span>Tiền thuê</span><span class="rcpt-red">-\${fmtVND(tong)}</span></div>
          \${cp > 0 ? '<div class="receipt-calc-row"><span>Chi phí khác</span><span class="rcpt-red">-\${fmtVND(cp)}</span></div>' : ''}
          <div class="receipt-total"><span>Hoàn lại</span><span class="rcpt-total-amount \${hoan >= 0 ? 'rcpt-green' : 'rcpt-red'}">\${fmtVND(hoan)}</span></div>
        </div>
        <div class="receipt-footer"><div class="receipt-thanks">Cảm ơn quý khách đã tin tưởng Aura Rental!</div></div>
      </div>
    </div>
    <div class="receipt-actions">
      <button class="btn-ghost" onclick="closeRefundScreenshot()">Đóng</button>
      <button class="btn-share" onclick="shareRefundScreenshotAsImage()">Chia sẻ / Copy ảnh</button>
    </div>
  \`;

  $('#rss-body').innerHTML = refundCardHTML;
  openModal('m-refund-screenshot');
}

function closeRefundScreenshot() {
  closeModal('m-refund-screenshot');
}

function shareRefundScreenshotAsImage() {
  const el = document.getElementById('refund-screenshot');
  if (!el) return;

  // Try html2canvas if available
  if (typeof html2canvas !== 'undefined') {
    html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    }).then(canvas => {
      canvas.toBlob(blob => {
        if (blob) {
          const file = new File([blob], 'phieu-hoan-coc-aura.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ title: 'Phiếu hoàn cọc - Aura Rental', files: [file] }).catch(() => {
              copyImageToClipboard(blob);
            });
          } else {
            copyImageToClipboard(blob);
          }
        }
      }, 'image/png');
    }).catch(() => { shareRefundAsText(); });
  } else {
    // Fallback: copy as image using canvas
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const rect = el.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      // Draw text-based receipt
      ctx.fillStyle = '#1A1D2E';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('AURA RENTAL', 20, 35);
      ctx.font = '10px Arial';
      ctx.fillStyle = '#666';
      ctx.fillText('Phiếu hoàn cọc', 20, 52);
      ctx.fillStyle = '#1A1D2E';
      ctx.font = '12px Arial';
      let y = 75;
      const id = el.querySelector('.receipt-id')?.textContent || '';
      ctx.fillText('Mã đơn: ' + id, 20, y); y += 20;
      ctx.fillText('Hoàn lại: ' + (el.querySelector('.rcpt-total-amount')?.textContent || ''), 20, y);
      canvas.toBlob(blob => {
        if (blob) {
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = 'phieu-hoan-coc-aura.png';
          a.click();
          toast('Đã tải ảnh!', 'success');
        }
      });
    } catch (e) { shareRefundAsText(); }
  }
}

function copyImageToClipboard(blob) {
  try {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
      toast('Đã copy ảnh vào clipboard!', 'success');
    }).catch(() => {
      // Download as fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'phieu-hoan-coc-aura.png';
      a.click();
      URL.revokeObjectURL(url);
      toast('Đã tải ảnh!', 'success');
    });
  } catch (e) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phieu-hoan-coc-aura.png';
    a.click();
    URL.revokeObjectURL(url);
    toast('Đã tải ảnh!', 'success');
  }
}

function shareRefundAsText() {
  const el = document.getElementById('refund-screenshot');
  if (!el) return;
  const maDon = el.querySelector('.receipt-id')?.textContent || '';
  const ngayHoan = el.querySelectorAll('.receipt-row')[1]?.querySelector('.receipt-value')?.textContent || '';
  const tenKhach = el.querySelectorAll('.receipt-row')[2]?.querySelector('.receipt-value')?.textContent || '';
  const sdtKhach = el.querySelectorAll('.receipt-row')[3]?.querySelector('.receipt-value')?.textContent || '';
  const tienCoc = el.querySelector('.rcpt-green')?.textContent || '';
  const tienThue = el.querySelectorAll('.rcpt-red')[0]?.textContent || '';
  const tienHoan = el.querySelector('.rcpt-total-amount')?.textContent || '';

  const text = 'AURA RENTAL - PHIẾU HOÀN CỌC\\n\\nMã đơn: ' + maDon + '\\nNgày hoàn: ' + ngayHoan + '\\n\\nKhách hàng:\\n' + tenKhach + ' | ' + sdtKhach + '\\n\\nThanh toán:\\nTiền cọc: ' + tienCoc + '\\nTiền thuê: ' + tienThue + '\\nHoàn lại: ' + tienHoan + '\\n\\nCảm ơn quý khách đã tin tưởng!';
  if (navigator.share) {
    navigator.share({ title: 'Phiếu hoàn cọc - Aura Rental', text: text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => { toast('Đã copy vào clipboard!', 'success'); }).catch(() => { toast('Copy thất bại', 'error'); });
  }
}
`;

content = content.substring(0, startIdx) + newFunction + content.substring(endIdx);

fs.writeFileSync(filePath, content);
console.log('Receipt functions updated successfully!');
