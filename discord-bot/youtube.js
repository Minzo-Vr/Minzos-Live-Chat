const DISCORD_API = "https://discord.com/api/v10";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/";
const HANDLE = "minzo-vr";
const JOB_PREFIX = "youtube:job:";
const STOP_PREFIX = "youtube:stop:";
const RESET_PREFIX = "youtube:reset:";
const POSTED_PREFIX = "youtube:posted:";
const LEGACY_DELETE_PREFIX = "youtube:delete:";
const ACTIVE = new Set(["resolving", "scanning", "posting"]);
const POST_BATCH_SIZE = 5;
const DEFAULT_POSTS_PER_TICK = 10;
const POST_INTERVAL_MS = 1100;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {"content-type": "application/json"}});
}
function ephemeral(content, components) {
  const data = {content, flags: 64, allowed_mentions: {parse: []}};
  if (components) data.components = components;
  return json({type: 4, data});
}
function isAdmin(data, env) {
  return String(data.guild_id || "") === String(env.DISCORD_GUILD_ID || "") &&
    (BigInt(data.member?.permissions || "0") & 8n) !== 0n;
}
function botHeaders(env) {
  return {authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json"};
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function discordRequest(path, options, env) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(DISCORD_API + path, {
      ...options,
      headers: {...botHeaders(env), ...(options?.headers || {})}
    });
    if (response.status !== 429) return response;
    const body = await response.json().catch(() => ({}));
    const retryAfter = Number(response.headers.get("retry-after") || body.retry_after || 1);
    await sleep(Math.max(250, Math.ceil(retryAfter * 1000) + 100));
  }
  throw Error("Discord kept rate-limiting the YouTube uploader. It will retry on the next scheduled run.");
}
async function postDiscord(channelId, content, env) {
  const response = await discordRequest("/channels/" + channelId + "/messages", {
    method: "POST",
    body: JSON.stringify({content, allowed_mentions: {parse: []}})
  }, env);
  if (!response.ok) throw Error("Discord could not post in the selected channel (HTTP " + response.status + "). Check View Channel, Send Messages and Embed Links permissions.");
  return response.json();
}
async function deleteDiscord(channelId, messageId, env) {
  return discordRequest("/channels/" + channelId + "/messages/" + messageId, {method: "DELETE"}, env);
}
async function saveJob(kv, key, job) {
  await kv.put(key, JSON.stringify(job), {expirationTtl: 2592000});
}
async function stopJob(kv, key, job, error, env) {
  job.status = "error";
  job.error = String(error?.message || error || "Unknown error").slice(0, 400);
  job.updatedAt = Date.now();
  await saveJob(kv, key, job);
  try {
    await postDiscord(job.channelId, "⚠️ **YouTube Auto Upload stopped.** " + job.error, env);
  } catch (postError) {
    console.error("YouTube upload error notification failed", String(postError));
  }
  console.error("YouTube Auto Upload stopped", job.error);
}
function validChannelId(value) {
  return /^\d{15,22}$/.test(String(value || ""));
}
function buttonRow(channelId) {
  return [{type: 1, components: [
    {type: 2, style: 1, label: "Start Auto Upload", custom_id: "youtube-start:" + channelId},
    {type: 2, style: 2, label: "Stop Upload", custom_id: "youtube-stop:" + channelId},
    {type: 2, style: 4, label: "Reset & Delete All", custom_id: "youtube-reset:" + channelId}
  ]}];
}

export async function handleYouTubeStartButton(data, env) {
  if (!isAdmin(data, env)) return ephemeral("Only administrators in the configured server can start YouTube Auto Upload.");
  if (!env.SAD_MESSAGES) return ephemeral("YouTube Auto Upload needs the existing SAD_MESSAGES KV binding.");
  if (!env.YOUTUBE_API_KEY) return ephemeral("The YouTube API key is not set yet. Add the YOUTUBE_API_KEY secret to the community-chat-discord-bot Worker first.");
  const customId = String(data.data?.custom_id || "");
  const channelId = customId.slice("youtube-start:".length);
  if (!validChannelId(channelId)) return ephemeral("That upload channel is invalid. Run /youtube again.");
  if (await env.SAD_MESSAGES.get(RESET_PREFIX + data.guild_id)) {
    return ephemeral("A reset is still deleting the previous video posts. Start again when the reset has finished.");
  }
  const channelResponse = await fetch(DISCORD_API + "/channels/" + channelId, {headers: botHeaders(env)});
  if (!channelResponse.ok) return ephemeral("I couldn't access that Discord channel. Check the bot's channel permissions.");
  const channel = await channelResponse.json();
  if (String(channel.guild_id) !== String(data.guild_id) || channel.type !== 0) {
    return ephemeral("Choose a normal text channel in this server.");
  }
  const jobKey = JOB_PREFIX + data.guild_id;
  const existing = await env.SAD_MESSAGES.get(jobKey, "json");
  if (existing && ACTIVE.has(existing.status)) {
    return ephemeral("A YouTube upload is already running in <#" + existing.channelId + ">.");
  }
  await env.SAD_MESSAGES.delete(STOP_PREFIX + data.guild_id);
  const job = {
    runId: crypto.randomUUID(),
    status: "resolving",
    guildId: String(data.guild_id),
    channelId,
    handle: HANDLE,
    videos: [],
    pageToken: null,
    nextIndex: 0,
    pages: 0,
    createdAt: Date.now()
  };
  await saveJob(env.SAD_MESSAGES, jobKey, job);
  return ephemeral("✅ YouTube Auto Upload started. I'm loading the public @minzo-vr archive first, then posting oldest to newest at about one video per second (up to 10 per minute). Each link is deleted after one hour.");
}

async function handleYouTubeStopButton(data, env, channelId) {
  if (!isAdmin(data, env)) return ephemeral("Only administrators in the configured server can stop YouTube Auto Upload.");
  if (!env.SAD_MESSAGES) return ephemeral("YouTube Auto Upload is not configured.");
  if (!validChannelId(channelId)) return ephemeral("That upload channel is invalid. Run /youtube again.");
  const jobKey = JOB_PREFIX + data.guild_id;
  const job = await env.SAD_MESSAGES.get(jobKey, "json");
  if (!job || !ACTIVE.has(job.status) || job.channelId !== channelId) {
    return ephemeral("There is no active YouTube upload running in that channel. Existing video posts have been left alone.");
  }
  await env.SAD_MESSAGES.put(STOP_PREFIX + data.guild_id, JSON.stringify({runId: job.runId, at: Date.now()}), {expirationTtl: 86400});
  job.status = "stopped";
  job.updatedAt = Date.now();
  await saveJob(env.SAD_MESSAGES, jobKey, job);
  return ephemeral("⏸️ **Upload stopped.** The bot will not post any more videos. Links already posted in Discord are left in place and will still auto-delete after one hour.");
}

async function handleYouTubeResetPrompt(data, env, channelId) {
  if (!isAdmin(data, env)) return ephemeral("Only administrators in the configured server can reset YouTube Auto Upload.");
  if (!validChannelId(channelId)) return ephemeral("That upload channel is invalid. Run /youtube again.");
  return ephemeral(
    "⚠️ **Confirm YouTube reset**\nThis stops an upload and deletes the video-link messages this uploader has posted in <#" + channelId + ">. Your original YouTube videos will not be touched.",
    [{type: 1, components: [
      {type: 2, style: 4, label: "Confirm Reset & Delete All", custom_id: "youtube-reset-confirm:" + channelId},
      {type: 2, style: 2, label: "Cancel", custom_id: "youtube-reset-cancel:" + channelId}
    ]}]
  );
}

async function handleYouTubeResetConfirm(data, env, channelId) {
  if (!isAdmin(data, env)) return ephemeral("Only administrators in the configured server can reset YouTube Auto Upload.");
  if (!env.SAD_MESSAGES) return ephemeral("YouTube Auto Upload is not configured.");
  if (!validChannelId(channelId)) return ephemeral("That upload channel is invalid. Run /youtube again.");
  const resetKey = RESET_PREFIX + data.guild_id;
  if (await env.SAD_MESSAGES.get(resetKey)) return ephemeral("A YouTube reset is already running. Let it finish first.");
  const jobKey = JOB_PREFIX + data.guild_id;
  const job = await env.SAD_MESSAGES.get(jobKey, "json");
  if (job && ACTIVE.has(job.status) && job.channelId === channelId) {
    await env.SAD_MESSAGES.put(STOP_PREFIX + data.guild_id, JSON.stringify({runId: job.runId, at: Date.now()}), {expirationTtl: 86400});
    job.status = "resetting";
    job.updatedAt = Date.now();
    await saveJob(env.SAD_MESSAGES, jobKey, job);
  }
  await env.SAD_MESSAGES.put(resetKey, JSON.stringify({
    channelId,
    phase: "collecting",
    messages: [],
    postedLoaded: false,
    legacyCursor: null,
    legacyIndex: 0,
    deleted: 0,
    failed: 0,
    createdAt: Date.now()
  }), {expirationTtl: 86400});
  return ephemeral("🧹 **Reset started.** The bot has stopped starting new uploads and is collecting its posted video links. It will delete them in safe batches. Your YouTube channel is unchanged.");
}

async function handleYouTubeResetCancel(data, env) {
  if (!isAdmin(data, env)) return ephemeral("Only administrators in the configured server can cancel this reset prompt.");
  return ephemeral("Reset cancelled. Nothing was deleted.");
}

export async function handleYouTubeButton(data, env) {
  const customId = String(data.data?.custom_id || "");
  if (customId.startsWith("youtube-start:")) return handleYouTubeStartButton(data, env);
  if (customId.startsWith("youtube-stop:")) return handleYouTubeStopButton(data, env, customId.slice("youtube-stop:".length));
  if (customId.startsWith("youtube-reset-confirm:")) return handleYouTubeResetConfirm(data, env, customId.slice("youtube-reset-confirm:".length));
  if (customId.startsWith("youtube-reset-cancel:")) return handleYouTubeResetCancel(data, env);
  if (customId.startsWith("youtube-reset:")) return handleYouTubeResetPrompt(data, env, customId.slice("youtube-reset:".length));
  return ephemeral("Unsupported YouTube control.");
}

async function youtubeGet(path, env) {
  const url = new URL(YOUTUBE_API + path);
  url.searchParams.set("key", env.YOUTUBE_API_KEY);
  const response = await fetch(url.toString());
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || "";
    const message = body?.error?.message || "YouTube Data API request failed";
    throw Error(message + (reason ? " [" + reason + "]" : "") + " (HTTP " + response.status + ")");
  }
  return body;
}

export async function processYouTubeScheduled(env, maxPosts = DEFAULT_POSTS_PER_TICK) {
  if (!env.SAD_MESSAGES || !env.DISCORD_GUILD_ID) return;
  const guildId = String(env.DISCORD_GUILD_ID);
  const jobKey = JOB_PREFIX + guildId;
  const resetKey = RESET_PREFIX + guildId;
  if (await env.SAD_MESSAGES.get(resetKey)) return;
  const job = await env.SAD_MESSAGES.get(jobKey, "json");
  if (!job || !ACTIVE.has(job.status)) return;
  try {
    const stop = await env.SAD_MESSAGES.get(STOP_PREFIX + guildId, "json");
    if (stop?.runId === job.runId) {
      job.status = "stopped";
      job.updatedAt = Date.now();
      await saveJob(env.SAD_MESSAGES, jobKey, job);
      return;
    }

    if (job.status === "resolving") {
      const channelData = await youtubeGet("channels?part=contentDetails&forHandle=" + encodeURIComponent(HANDLE), env);
      const channel = channelData.items?.[0];
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) throw Error("I couldn't find the @minzo-vr YouTube channel or its uploads playlist. Check that the handle is correct and the API key is valid.");
      job.uploadsPlaylistId = uploadsPlaylistId;
      job.status = "scanning";
      job.pageToken = null;
      job.videos = [];
      job.pages = 0;
      await saveJob(env.SAD_MESSAGES, jobKey, job);
    }

    if (job.status === "scanning") {
      for (let pageNumber = 0; pageNumber < 5 && job.status === "scanning"; pageNumber++) {
        const stopNow = await env.SAD_MESSAGES.get(STOP_PREFIX + guildId, "json");
        if (stopNow?.runId === job.runId || await env.SAD_MESSAGES.get(resetKey)) {
          job.status = "stopped";
          job.updatedAt = Date.now();
          await saveJob(env.SAD_MESSAGES, jobKey, job);
          return;
        }
        let path = "playlistItems?part=snippet&maxResults=50&playlistId=" + encodeURIComponent(job.uploadsPlaylistId);
        if (job.pageToken) path += "&pageToken=" + encodeURIComponent(job.pageToken);
        const page = await youtubeGet(path, env);
        for (const item of (page.items || [])) {
          const snippet = item?.snippet || {};
          const videoId = snippet.resourceId?.videoId;
          if (!videoId || snippet.title === "Private video" || snippet.title === "Deleted video") continue;
          job.videos.push({
            id: videoId,
            title: String(snippet.title || "YouTube video").slice(0, 200),
            publishedAt: snippet.publishedAt || ""
          });
        }
        job.pages++;
        if (page.nextPageToken) {
          job.pageToken = page.nextPageToken;
        } else {
          job.pageToken = null;
          job.videos.sort((a, b) => {
            const dateOrder = String(a.publishedAt).localeCompare(String(b.publishedAt));
            return dateOrder || a.id.localeCompare(b.id);
          });
          job.status = "posting";
          job.nextIndex = 0;
        }
        await saveJob(env.SAD_MESSAGES, jobKey, job);
      }
      // Keep scanning separate from posting so the same Cron run stays within
      // Cloudflare's subrequest budget, including the bot's other scheduled jobs.
      return;
    }

    if (job.status === "posting") {
      if (!job.videos.length) {
        await postDiscord(job.channelId, "No public videos were found on @minzo-vr.", env);
        job.status = "complete";
        job.completedAt = Date.now();
        await saveJob(env.SAD_MESSAGES, jobKey, job);
        return;
      }
      const postedKey = POSTED_PREFIX + job.channelId;
      const postedData = await env.SAD_MESSAGES.get(postedKey, "json") || {messages: []};
      postedData.messages = Array.isArray(postedData.messages) ? postedData.messages : [];
      let postedThisTick = 0;

      while (postedThisTick < maxPosts && job.nextIndex < job.videos.length) {
        if (postedThisTick % POST_BATCH_SIZE === 0) {
          const stopNow = await env.SAD_MESSAGES.get(STOP_PREFIX + guildId, "json");
          if (stopNow?.runId === job.runId || await env.SAD_MESSAGES.get(resetKey)) {
            job.status = stopNow?.runId === job.runId ? "stopped" : "resetting";
            job.updatedAt = Date.now();
            await env.SAD_MESSAGES.put(postedKey, JSON.stringify(postedData), {expirationTtl: 86400});
            await saveJob(env.SAD_MESSAGES, jobKey, job);
            return;
          }
        }
        const video = job.videos[job.nextIndex];
        const posted = await postDiscord(job.channelId, "https://www.youtube.com/watch?v=" + video.id, env);
        postedData.messages.push({
          messageId: posted.id,
          expiresAt: Date.now() + 3600000
        });
        job.nextIndex++;
        postedThisTick++;

        if (postedThisTick % POST_BATCH_SIZE === 0) {
          await env.SAD_MESSAGES.put(postedKey, JSON.stringify(postedData), {expirationTtl: 86400});
          await saveJob(env.SAD_MESSAGES, jobKey, job);
        }
        if (job.nextIndex < job.videos.length && postedThisTick < maxPosts) await sleep(POST_INTERVAL_MS);
      }

      if (postedThisTick % POST_BATCH_SIZE !== 0) {
        await env.SAD_MESSAGES.put(postedKey, JSON.stringify(postedData), {expirationTtl: 86400});
        await saveJob(env.SAD_MESSAGES, jobKey, job);
      }
      if (job.nextIndex >= job.videos.length) {
        await postDiscord(job.channelId, "✅ **Finished Auto Video Upload!**", env);
        job.status = "complete";
        job.completedAt = Date.now();
        await saveJob(env.SAD_MESSAGES, jobKey, job);
      }
    }
  } catch (error) {
    await stopJob(env.SAD_MESSAGES, jobKey, job, error, env);
  }
}

export async function processYouTubeReset(env) {
  if (!env.SAD_MESSAGES || !env.DISCORD_GUILD_ID) return false;
  const guildId = String(env.DISCORD_GUILD_ID);
  const resetKey = RESET_PREFIX + guildId;
  const reset = await env.SAD_MESSAGES.get(resetKey, "json");
  if (!reset) return false;

  if (reset.phase === "collecting") {
    if (!reset.postedLoaded) {
      const postedData = await env.SAD_MESSAGES.get(POSTED_PREFIX + reset.channelId, "json");
      reset.messages = (postedData?.messages || []).map(item => ({
        messageId: String(item.messageId || ""),
        attempts: 0
      })).filter(item => /^\d{15,22}$/.test(item.messageId));
      reset.postedLoaded = true;
    }

    const page = await env.SAD_MESSAGES.list({
      prefix: LEGACY_DELETE_PREFIX,
      limit: 1000,
      ...(reset.legacyCursor ? {cursor: reset.legacyCursor} : {})
    });
    let index = Number(reset.legacyIndex || 0);
    let scanned = 0;
    const known = new Set(reset.messages.map(item => item.messageId));
    while (index < page.keys.length && scanned < 15) {
      const key = page.keys[index++];
      scanned++;
      const suffix = key.name.slice(LEGACY_DELETE_PREFIX.length);
      if (suffix.includes(":")) continue;
      const record = await env.SAD_MESSAGES.get(key.name, "json");
      if (record?.channelId === reset.channelId && /^\d{15,22}$/.test(String(record.messageId || ""))) {
        const messageId = String(record.messageId);
        if (!known.has(messageId)) {
          reset.messages.push({messageId, attempts: 0, legacyKey: key.name});
          known.add(messageId);
        }
      }
    }
    if (index >= page.keys.length) {
      if (page.list_complete) {
        reset.phase = "deleting";
        await env.SAD_MESSAGES.delete(POSTED_PREFIX + reset.channelId);
      } else {
        reset.legacyCursor = page.cursor;
        reset.legacyIndex = 0;
      }
    } else {
      reset.legacyIndex = index;
    }
    await env.SAD_MESSAGES.put(resetKey, JSON.stringify(reset), {expirationTtl: 86400});
    if (reset.phase !== "deleting") return true;
  }

  let attempted = 0;
  const remaining = [];
  while (reset.messages.length && attempted < 20) {
    const item = reset.messages.shift();
    attempted++;
    try {
      const response = await deleteDiscord(reset.channelId, item.messageId, env);
      if (response.ok || response.status === 404) {
        reset.deleted++;
        if (item.legacyKey) await env.SAD_MESSAGES.delete(item.legacyKey);
      } else {
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= 3) reset.failed++;
        else remaining.push(item);
      }
    } catch (error) {
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts >= 3) reset.failed++;
      else remaining.push(item);
      console.warn("YouTube reset delete retry", String(error));
    }
  }
  reset.messages = remaining.concat(reset.messages);
  if (reset.messages.length) {
    await env.SAD_MESSAGES.put(resetKey, JSON.stringify(reset), {expirationTtl: 86400});
    return true;
  }

  await env.SAD_MESSAGES.delete(resetKey);
  const jobKey = JOB_PREFIX + guildId;
  const job = await env.SAD_MESSAGES.get(jobKey, "json");
  if (job?.channelId === reset.channelId) {
    job.status = "reset";
    job.videos = [];
    job.nextIndex = 0;
    job.updatedAt = Date.now();
    await saveJob(env.SAD_MESSAGES, jobKey, job);
  }
  const summary = "🧹 **YouTube reset complete.** Deleted " + reset.deleted + " video-link messages" +
    (reset.failed ? "; " + reset.failed + " could not be deleted because Discord denied the request." : ".") +
    " Your original YouTube videos are untouched.";
  try { await postDiscord(reset.channelId, summary, env); }
  catch (error) { console.warn("YouTube reset completion notice failed", String(error)); }
  return true;
}

export async function processYouTubeDeletions(env) {
  if (!env.SAD_MESSAGES) return 0;
  let deleted = 0;
  const now = Date.now();
  const page = await env.SAD_MESSAGES.list({prefix: POSTED_PREFIX, limit: 1000});
  let channelsScanned = 0;
  for (const key of page.keys) {
    if (deleted >= 10 || channelsScanned >= 10) break;
    channelsScanned++;
    const record = await env.SAD_MESSAGES.get(key.name, "json");
    if (!record || !Array.isArray(record.messages)) continue;
    const keep = [];
    let changed = false;
    for (const item of record.messages) {
      if (deleted >= 10 || item.expiresAt > now) {
        keep.push(item);
        continue;
      }
      const response = await deleteDiscord(key.name.slice(POSTED_PREFIX.length), item.messageId, env);
      if (response.ok || response.status === 404) {
        deleted++;
        changed = true;
      } else {
        keep.push(item);
      }
    }
    if (changed) {
      if (keep.length) await env.SAD_MESSAGES.put(key.name, JSON.stringify({messages: keep}), {expirationTtl: 86400});
      else await env.SAD_MESSAGES.delete(key.name);
    }
  }

  // Clean up per-message records created by the earlier uploader version.
  const legacy = await env.SAD_MESSAGES.list({prefix: LEGACY_DELETE_PREFIX, limit: 1000});
  let legacyDone = 0;
  let legacyScanned = 0;
  for (const key of legacy.keys) {
    if (legacyDone >= 2 || legacyScanned >= 10) break;
    const suffix = key.name.slice(LEGACY_DELETE_PREFIX.length);
    if (suffix.includes(":")) continue;
    legacyScanned++;
    const record = await env.SAD_MESSAGES.get(key.name, "json");
    if (!record || record.expiresAt > now) continue;
    const response = await deleteDiscord(record.channelId, record.messageId, env);
    if (response.ok || response.status === 404) {
      await env.SAD_MESSAGES.delete(key.name);
      legacyDone++;
      deleted++;
    }
  }
  return deleted;
}
