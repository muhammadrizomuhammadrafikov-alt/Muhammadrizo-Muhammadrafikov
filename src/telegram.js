import { COLOR_FINISHES, formatPriceUZS } from './catalog.js';

const STORAGE_KEY = 'monolit_telegram_config';

// User-provided credentials (cleaned from pasted chat timestamps 15:01 / 15:04)
const DEFAULT_BOT_TOKEN = '9078705877:AAE4EE40CrTsXrBW2_zJznplUjUw76OmNgk';
const DEFAULT_CHANNEL_ID = '9078705877';

export function getTelegramConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        botToken: (parsed.botToken || DEFAULT_BOT_TOKEN).trim(),
        channelId: (parsed.channelId || DEFAULT_CHANNEL_ID).trim(),
      };
    }
  } catch {
    // Ignore storage read failure
  }
  return {
    botToken: DEFAULT_BOT_TOKEN,
    channelId: DEFAULT_CHANNEL_ID,
  };
}

export function buildOrderMessage(order) {
  const lines = [
    '🪑 *YANGI BUYURTMA — MONOLIT MEBEL*',
    `🆔 *Buyurtma raqami:* #${order.orderNumber}`,
    '',
    `👤 *Mijoz:* ${escapeMarkdown(order.customer.name)}`,
    `📞 *Telefon:* ${escapeMarkdown(order.customer.phone)}`,
    `📍 *Manzil:* ${escapeMarkdown(order.customer.address)}`,
  ];

  if (order.customer.note) {
    lines.push(`📝 *Izoh:* ${escapeMarkdown(order.customer.note)}`);
  }

  lines.push('', '📦 *Tanlangan mahsulotlar:*');

  order.items.forEach((item, index) => {
    const finishLabel = COLOR_FINISHES[item.color]?.label || item.color;
    const itemTotal = formatPriceUZS(item.price * item.quantity);
    lines.push(
      `${index + 1}. *${escapeMarkdown(item.name)}* (${escapeMarkdown(finishLabel)}) — ${item.quantity} dona × ${formatPriceUZS(item.price)} = *${itemTotal}*`
    );
  });

  lines.push('', `💰 *Jami summa:* *${formatPriceUZS(order.total)}*`);
  lines.push(`🕒 *Vaqt:* ${new Date().toLocaleString('uz-UZ')}`);

  return lines.join('\n');
}

function escapeMarkdown(value) {
  return String(value || '').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function postToTelegram(botToken, chatId, text) {
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data.ok === true, status: response.status, data };
}

export async function sendOrderToTelegram(order) {
  const { botToken, channelId } = getTelegramConfig();
  const text = buildOrderMessage(order);

  // Try exact configured channel ID first
  const primaryAttempt = await postToTelegram(botToken, channelId, text);
  if (primaryAttempt.ok) {
    return {
      sent: true,
      chatIdUsed: channelId,
      message: 'Buyurtmangiz Telegram kanalga muvaffaqiyatli yuborildi.',
    };
  }

  // If numeric channel ID lacks Telegram's -100 prefix, try -100<id> automatically
  const numericOnly = /^\d+$/.test(channelId);
  if (numericOnly && !channelId.startsWith('100')) {
    const prefixedId = `-100${channelId}`;
    const fallbackAttempt = await postToTelegram(botToken, prefixedId, text);
    if (fallbackAttempt.ok) {
      return {
        sent: true,
        chatIdUsed: prefixedId,
        message: 'Buyurtmangiz Telegram kanalga muvaffaqiyatli yuborildi.',
      };
    }
  }

  const description =
    primaryAttempt.data?.description || `Telegram API xatosi (${primaryAttempt.status})`;
  return {
    sent: false,
    error: description,
    message: `Buyurtma #${order.orderNumber} ro‘yxatga olindi, lekin Telegram kanalga yuborishda xatolik yuz berdi: ${description}`,
  };
}
