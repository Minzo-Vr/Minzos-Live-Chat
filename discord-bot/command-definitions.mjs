export const commands=[
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
{name:"announce",description:"Post an admin announcement to Discord",default_member_permissions:"8",options:[{type:3,name:"message",description:"Announcement text",required:true,max_length:1500}]}
];

// User-install and guild-install public commands. Do not also register them at guild scope.
export const PUBLIC_COMMAND_NAMES=["ping","ask","sad","help","latest","updates","status"];
