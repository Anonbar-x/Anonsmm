const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const token = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const bot = new TelegramBot(token);

const users = {};

const SERVICES = {
  "📘 Facebook Followers": 1,
  "👍 Facebook Likes": 2,
  "❤️ Facebook Reactions": 3,
  "👀 Facebook Views": 4
};

function isValidFacebookLink(link) {
  const valid =
    /^https?:\/\/(www\.)?facebook\.com\/(?!.*(posts|reel|photo|videos)).+/i;

  return valid.test(link);
}

async function checkBalance() {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
      action: "balance"
    });

    return response.data.balance || 0;
  } catch (e) {
    return 0;
  }
}

async function submitOrder(service, link, quantity) {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
      action: "add",
      service,
      link,
      quantity
    });

    return response.data;
  } catch (e) {
    return { error: true };
  }
}

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const update = req.body;

    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (!users[chatId]) {
        users[chatId] = {
          loggedIn: false,
          step: null
        };
      }

      const user = users[chatId];

      if (text === "/start") {
        user.loggedIn = false;
        user.step = "password";

        await bot.sendMessage(chatId, "🔐 Admin Password দিন");
      }

      else if (user.step === "password") {
        if (text === ADMIN_PASSWORD) {
          user.loggedIn = true;
          user.step = null;

          await bot.sendMessage(
            chatId,
            "✅ Login Successful",
            {
              reply_markup: {
                keyboard: [
                  ["🛒 নতুন অর্ডার"],
                  ["💰 ব্যালেন্স"]
                ],
                resize_keyboard: true
              }
            }
          );
        } else {
          await bot.sendMessage(chatId, "❌ ভুল Password");
        }
      }

      else if (text === "💰 ব্যালেন্স") {
        const balance = await checkBalance();

        await bot.sendMessage(
          chatId,
          `💰 বর্তমান ব্যালেন্স: ${balance}`
        );
      }

      else if (text === "🛒 নতুন অর্ডার") {
        user.step = "service";

        await bot.sendMessage(
          chatId,
          "📦 সার্ভিস নির্বাচন করুন",
          {
            reply_markup: {
              keyboard: Object.keys(SERVICES).map(s => [s]),
              resize_keyboard: true
            }
          }
        );
      }

      else if (SERVICES[text]) {
        user.serviceName = text;
        user.serviceId = SERVICES[text];
        user.step = "link";

        await bot.sendMessage(
          chatId,
          "🔗 Facebook Profile/Page Link দিন"
        );
      }

      else if (user.step === "link") {
        if (isValidFacebookLink(text)) {
          user.link = text;
          user.step = "quantity";

          await bot.sendMessage(
            chatId,
            "✅ Link Verified\n\n📦 কত নিতে চান?"
          );
        } else {
          await bot.sendMessage(
            chatId,
            "❌ Link Not Verified"
          );
        }
      }

      else if (user.step === "quantity") {
        user.quantity = text;
        user.step = "confirm";

        await bot.sendMessage(
          chatId,
          `📋 Order Summary

Service: ${user.serviceName}
Quantity: ${user.quantity}

Submit করতে YES লিখুন`
        );
      }

      else if (user.step === "confirm") {
        if (text.toLowerCase() === "yes") {

          const balance = await checkBalance();

          if (Number(balance) <= 0) {
            await bot.sendMessage(
              chatId,
              "❌ ব্যালেন্স নেই\n\n⚠️ Panel এ Balance Load করুন"
            );

            return res.status(200).send("OK");
          }

          const result = await submitOrder(
            user.serviceId,
            user.link,
            user.quantity
          );

          if (result.order) {
            await bot.sendMessage(
              chatId,
              `✅ Order Submitted\n\n🆔 Order ID: ${result.order}`
            );
          } else {
            await bot.sendMessage(
              chatId,
              "❌ Order Failed"
            );
          }

          user.step = null;
        }
      }
    }

    return res.status(200).send("OK");
  }

  res.status(200).send("Bot Running");
};
