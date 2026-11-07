// Shared by the Discord Gateway listener and the Cloudflare cron moderator.
// The user chooses a single word, not a string of words joined with punctuation.
export const ONE_WORD_STORIES_CHANNEL_NAME="1-word-stories";
export function isOneStoryWord(input){
 if(typeof input!=="string")return false;
 const word=input.trim().normalize("NFC");
 // Unicode letters and combining accents, optional single-word contraction and
 // ONE terminal punctuation mark. Disallow hyphens, underscores, zero-width
 // separators, numbers, URLs, mentions, emoji, line breaks and multiword text.
 if(Array.from(word).length>40)return false;
 return /^\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)?[.!?,;:]?$/u.test(word);
}
export function isStoryMessageValid(message){
 return Boolean(message&&!message.author?.bot&&!message.webhook_id&&
  isOneStoryWord(message.content)&&
  !(message.attachments?.size||message.attachments?.length)&&
  !(message.embeds?.length)&&
  !(message.stickers?.size||message.sticker_items?.length)&&
  !message.poll);
}
export function storyInstructions(){
 return [
  "📖 **1 WORD STORIES**",
  "Together, write a story one word at a time!",
  "",
  "✅ **Exactly one word** per message (examples: \`Hello\`, \`don't\`, \`world!\`).",
  "⛔ **No two turns in a row:** wait until someone else adds a valid word.",
  "⛔ **No tricks:** \`he-liked-her\`, underscores, hidden characters, numbers, links, emojis and attachments are not allowed.",
  "",
  "✅ Accepted words receive a ✅ reaction.",
  "❌ Invalid or consecutive words receive a ❌ reaction before removal.",
  "Continue the story below! 📚",
 ].join("\n");
}
