const DISCORD_API = "https://discord.com/api/v10";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/";
const HANDLE = "minzo-vr";
const JOB_PREFIX = "youtube:job:";
const DELETE_PREFIX = "youtube:delete:";
const ACTIVE = new Set(["resolving", "scanning", "posting"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {"content-type": "application/json"}});
}
function ephemeral(content) {
  return json({type: 4, data: {content, flags: 64, allowed_mentions: {parse: []}}});
}
function isAdmin(data, env) {
  return String(data.guild_id || "") === String(env.DISCORD_GUILD_ID || "") &&
    (BigInt(data.member?.permissions || "0") & 8n) !== 0n;
}
function botHeaders(env) {
  return {authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json"};
}
async function postDiscord(channelId, content, env) {
  const response = await fetch(DISCORD_API + "/channels/" + channelId + "/messages", {
    method: "POST", headers: botHeaders(env),
    body: JSON.stringify({content, allowed_mentions: {parse: []}})
  });
  if (!response.ok) throw Error("Discord could not post in the selected channel (HTTP " + response.status + "). Check View Channel, Send Messages and Embed Links permissions.");
  return response.json();
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

export async function handleYouTubeStartButton(data, env) {
  if (!isAdmin(data, env)) return ephemeral("Only administrators in the configured server can start YouTube Auto Upload.");
  if (!env.SAD_MESSAGES) return ephemeral("YouTube Auto Upload needs the existing SAD_MESSAGES KV binding.");
  if (!env.YOUTUBE_API_KEY) return ephemeral("The YouTube API key is not set yet. Add the YOUTUBE_API_KEY secret to the community-chat-discord-bot Worker first.");
  const customId = String(data.data?.custom_id || "");
  const channelId = customId.slice("youtube-start:".length);
  if (!/^\d{15,22}$/.test(channelId)) return ephemeral("That upload channel is invalid. Run /youtube again.");
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
  const job = {
    status: "resolving",
    guildId: String(data.guild_id),
    channelId,
    handle: HANDLE,
    videos: [],
    pageToken: null,
    nextIndex: 0,
    nextPostAt: 0,
    pages: 0,
    createdAt: Date.now()
  };
  await saveJob(env.SAD_MESSAGES, jobKey, job);
  return ephemeral("✅ YouTube Auto Upload started. I'm loading the full public video archive for @minzo-vr first, then I'll post the videos oldest to newest, one per minute. Each video post will delete itself after one hour.");
}

export async function processYouTubeScheduled(env) {
  if (!env.SAD_MESSAGES || !env.DISCORD_GUILD_ID) return;
  const jobKey = JOB_PREFIX + env.DISCORD_GUILD_ID;
  const job = await env.SAD_MESSAGES.get(jobKey, "json");
  if (!job || !ACTIVE.has(job.status)) return;
  try {
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
      // Read up to five 50-video pages per minute. This loads the entire archive
      // before posting, so reversing the final list produces true oldest-first order.
      for (let pageNumber = 0; pageNumber < 5 && job.status === "scanning"; pageNumber++) {
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
          job.nextPostAt = Date.now();
        }
        await saveJob(env.SAD_MESSAGES, jobKey, job);
      }
      if (job.status === "scanning") return;
    }

    if (job.status === "posting") {
      if (job.nextPostAt && Date.now() < job.nextPostAt) return;
      if (!job.videos.length) {
        await postDiscord(job.channelId, "No public videos were found on @minzo-vr.", env);
        job.status = "complete";
        job.completedAt = Date.now();
        await saveJob(env.SAD_MESSAGES, jobKey, job);
        return;
      }
      const video = job.videos[job.nextIndex];
      if (!video) {
        await postDiscord(job.channelId, "✅ **Finished Auto Video Upload!**", env);
        job.status = "complete";
        job.completedAt = Date.now();
        await saveJob(env.SAD_MESSAGES, jobKey, job);
        return;
      }
      const posted = await postDiscord(job.channelId, "https://www.youtube.com/watch?v=" + video.id, env);
      const deleteKey = DELETE_PREFIX + posted.id;
      try {
        await env.SAD_MESSAGES.put(deleteKey, JSON.stringify({
          channelId: job.channelId,
          messageId: posted.id,
          expiresAt: Date.now() + 3600000
        }), {expirationTtl: 7200});
      } catch (error) {
        await fetch(DISCORD_API + "/channels/" + job.channelId + "/messages/" + posted.id, {
          method: "DELETE", headers: botHeaders(env)
        }).catch(() => {});
        throw Error("I couldn't schedule the one-hour deletion, so I withdrew the video post. " + String(error));
      }
      job.nextIndex++;
      if (job.nextIndex >= job.videos.length) {
        await postDiscord(job.channelId, "✅ **Finished Auto Video Upload!**", env);
        job.status = "complete";
        job.completedAt = Date.now();
      } else {
        job.nextPostAt = Date.now() + 60000;
      }
      await saveJob(env.SAD_MESSAGES, jobKey, job);
    }
  } catch (error) {
    await stopJob(env.SAD_MESSAGES, jobKey, job, error, env);
  }
}

export async function processYouTubeDeletions(env) {
  if (!env.SAD_MESSAGES) return;
  let cursor;
  do {
    const page = await env.SAD_MESSAGES.list({
      prefix: DELETE_PREFIX,
      limit: 1000,
      ...(cursor ? {cursor} : {})
    });
    for (const key of page.keys) {
      const record = await env.SAD_MESSAGES.get(key.name, "json");
      if (!record || record.expiresAt > Date.now()) continue;
      const response = await fetch(DISCORD_API + "/channels/" + record.channelId + "/messages/" + record.messageId, {
        method: "DELETE", headers: botHeaders(env)
      });
      if (response.ok || response.status === 404 || response.status === 403) {
        await env.SAD_MESSAGES.delete(key.name);
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}
