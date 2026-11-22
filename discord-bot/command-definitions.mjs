export const commands=[
{name:"loggings",description:"Configure private opt-in custom status logging",default_member_permissions:"8",options:[
 {type:3,name:"action",description:"Logging action",required:false,choices:[{name:"View settings",value:"view"},{name:"Enable",value:"enable"},{name:"Disable",value:"disable"}]},
 {type:7,name:"channel",description:"Private administrator text channel (required for enabling)",required:false,channel_types:[0]}
]},
{name:"status-sharing",description:"Choose whether your visible custom status changes are shared with admins",options:[
 {type:3,name:"action",description:"Your opt-in preference; logs expire after 24 hours",required:true,choices:[{name:"Opt in",value:"on"},{name:"Opt out",value:"off"},{name:"View preference",value:"view"}]}
]},
{name:"speak",description:"Make Minzo Voice AI speak in your voice channel",options:[{type:3,name:"phrase",description:"What should the bot say?",required:true,max_length:180},{type:3,name:"voice",description:"Choose a voice",required:false,choices:[{name:"Natural",value:"natural"},{name:"Robot",value:"robot"}]}]},
{name:"stop",description:"Stop Minzo Voice AI speaking"},
{name:"ping",description:"Check Community Chat bot"},
{name:"ask",description:"Ask Community Hub AI about any app or general topic",options:[
 {type:3,name:"question",description:"What would you like to ask?",required:true,max_length:1200},
 {type:3,name:"category",description:"Choose the app or topic",required:true,choices:[
  {name:"Chats",value:"chats"},
  {name:"User",value:"user"},
  {name:"Login",value:"login"},
  {name:"Shapes and Colors",value:"shapes_and_colors"},
  {name:"Update Centre",value:"update_centre"},
  {name:"Ai (Admin Only)",value:"ai_admin"},
  {name:"All",value:"all"},
  {name:"Generic Question",value:"generic_question"}]},
 {type:3,name:"visibility",description:"Who can see the question and answer?",required:false,choices:[{name:"Everyone",value:"everyone"},{name:"Only Me",value:"only_me"}]}
]},
{name:"sad",description:"Send a message that automatically deletes",options:[{type:3,name:"time",description:"Duration: 1m, 10m, 1h, 1d",required:true},{type:3,name:"message",description:"Message to send",required:true,max_length:1500}]},
{name:"help",description:"List Community Chat bot commands"},
{name:"latest",description:"Show the latest published Community Chat update"},
{name:"updates",description:"Show recent Community Chat updates"},
{name:"status",description:"Get the Community Chat website"},
{name:"setup_applications",description:"Create a private application-reviews channel",default_member_permissions:"8"},
{name:"setup_tickets",description:"Install or repair App Reports, Direct Support and Bug Support ticket panels",default_member_permissions:"8"},
{name:"setup_one_word_stories",description:"Create or repair the 1 Word Stories Discord text channel",default_member_permissions:"8"},
{name:"applications",description:"Post application opening or closing announcements",default_member_permissions:"8",options:[
 {type:3,name:"status",description:"Open or close applications",required:true,choices:[{name:"Open",value:"open"},{name:"Closed",value:"closed"}]},
 {type:3,name:"type",description:"Application category",required:true,choices:[{name:"Moderator",value:"moderator"},{name:"Test Subjects / Lab Rats",value:"test_subjects"}]},
 {type:8,name:"role",description:"Role to notify (choose a Discord role)",required:true},
 {type:3,name:"apply_url",description:"Application form HTTPS link (required when opening)",required:false},
 {type:3,name:"info_url",description:"Information HTTPS link (required when opening)",required:false},
 {type:3,name:"closes",description:"Closing date or deadline (optional)",required:false},
 {type:3,name:"starts",description:"When applications open (optional)",required:false},
 {type:3,name:"results",description:"When applicants hear back (optional)",required:false}
]},
{name:"add-role-to-user",description:"Give a linked Community Chat account a role",default_member_permissions:"8",options:[{type:6,name:"user",description:"Discord user to receive the role",required:true},{type:3,name:"role",description:"Community Chat role",required:true,choices:[{name:"Moderator",value:"moderator"},{name:"Plus",value:"plus"},{name:"Test Subject",value:"testsubject"},{name:"Admin",value:"admin"}]}]},
{name:"youtube",description:"Share all @minzo-vr videos to a Discord channel",default_member_permissions:"8",options:[{type:7,name:"channel",description:"Text channel to receive the YouTube video links",required:true,channel_types:[0]}]},
{name:"percentage",description:"Set a member percentage and DM them",default_member_permissions:"8",options:[{type:6,name:"user",description:"Server member to update",required:true},{type:4,name:"percentage",description:"Percentage from 0 to 100",required:true,min_value:0,max_value:100}]},
{name:"announce",description:"Post an admin announcement to Discord",default_member_permissions:"8",options:[{type:3,name:"message",description:"Announcement text",required:true,max_length:1500}]}
];

// User-install and guild-install public commands. Do not also register them at guild scope.
export const PUBLIC_COMMAND_NAMES=["speak","stop","ping","ask","sad","help","latest","updates","status"];
