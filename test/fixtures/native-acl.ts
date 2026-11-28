// Representative persisted PredicateFormula trees from Grist's predicate grammar.
// These fixtures are independent of the Gia condition parser and renderer.
type Node = [string, ...(Node | string | number | boolean | null)[]];

const name = (value: string): Node => ["Name", value];
const attr = (owner: string, ...fields: string[]): Node =>
  fields.reduce<Node>((value, field) => ["Attr", value, field], name(owner));

const predicates: Record<string, Node | null> = {
  "\"\" == rec.OwnerEmail":
    ["Eq", ["Const", ""], attr("rec", "OwnerEmail")],
  "'' == rec.OwnerEmail":
    ["Eq", ["Const", ""], attr("rec", "OwnerEmail")],
  "(rec.Enabled == True and rec.OwnerEmail == user.Email) or user.Access == OWNER":
    ["Or", ["And", ["Eq", attr("rec", "Enabled"), ["Const", true]], ["Eq", attr("rec", "OwnerEmail"), attr("user", "Email")]], ["Eq", attr("user", "Access"), name("OWNER")]],
  "1 == rec.UserId":
    ["Eq", ["Const", 1], attr("rec", "UserId")],
  "1.0 == rec.UserId":
    ["Eq", ["Const", 1.0], attr("rec", "UserId")],
  "True == rec.Enabled":
    ["Eq", ["Const", true], attr("rec", "Enabled")],
  "True == user.IsLoggedIn":
    ["Eq", ["Const", true], attr("user", "IsLoggedIn")],
  "newRec.Enabled == True":
    ["Eq", attr("newRec", "Enabled"), ["Const", true]],
  "newRec.OwnerEmail != rec.OwnerEmail":
    ["NotEq", attr("newRec", "OwnerEmail"), attr("rec", "OwnerEmail")],
  "newRec.OwnerEmail == user.Email":
    ["Eq", attr("newRec", "OwnerEmail"), attr("user", "Email")],
  "newRec.ShareToken == 'sensitive-value'":
    ["Eq", attr("newRec", "ShareToken"), ["Const", "sensitive-value"]],
  "not rec.Enabled == False":
    ["Not", ["Eq", attr("rec", "Enabled"), ["Const", false]]],
  "not rec.Title == newRec.Title":
    ["Not", ["Eq", attr("rec", "Title"), attr("newRec", "Title")]],
  "rec.Enabled != ''":
    ["NotEq", attr("rec", "Enabled"), ["Const", ""]],
  "rec.Enabled == 'sensitive-value'":
    ["Eq", attr("rec", "Enabled"), ["Const", "sensitive-value"]],
  "rec.Enabled == 1":
    ["Eq", attr("rec", "Enabled"), ["Const", 1]],
  "rec.Enabled == True":
    ["Eq", attr("rec", "Enabled"), ["Const", true]],
  "rec.Enabled == True and rec.OwnerEmail == user.Email":
    ["And", ["Eq", attr("rec", "Enabled"), ["Const", true]], ["Eq", attr("rec", "OwnerEmail"), attr("user", "Email")]],
  "rec.Enabled in [True, False]":
    ["In", attr("rec", "Enabled"), ["List", ["Const", true], ["Const", false]]],
  "rec.Flag == 1":
    ["Eq", attr("rec", "Flag"), ["Const", 1]],
  "rec.OwnerEmail == ' '":
    ["Eq", attr("rec", "OwnerEmail"), ["Const", " "]],
  "rec.OwnerEmail == ''":
    ["Eq", attr("rec", "OwnerEmail"), ["Const", ""]],
  "rec.OwnerEmail == 'private-token'":
    ["Eq", attr("rec", "OwnerEmail"), ["Const", "private-token"]],
  "rec.OwnerEmail == None":
    ["Eq", attr("rec", "OwnerEmail"), ["Const", null]],
  "rec.OwnerEmail == True":
    ["Eq", attr("rec", "OwnerEmail"), ["Const", true]],
  "rec.OwnerEmail == newRec.OwnerEmail":
    ["Eq", attr("rec", "OwnerEmail"), attr("newRec", "OwnerEmail")],
  "rec.OwnerEmail == rec.OwnerEmail":
    ["Eq", attr("rec", "OwnerEmail"), attr("rec", "OwnerEmail")],
  "rec.OwnerEmail == user.Email":
    ["Eq", attr("rec", "OwnerEmail"), attr("user", "Email")],
  "rec.OwnerEmail == user.LinkKey.StageToken":
    ["Eq", attr("rec", "OwnerEmail"), attr("user", "LinkKey", "StageToken")],
  "rec.OwnerEmail == user.LinkKey.Token":
    ["Eq", attr("rec", "OwnerEmail"), attr("user", "LinkKey", "Token")],
  "rec.OwnerEmail == user.Mentor.OwnerEmail":
    ["Eq", attr("rec", "OwnerEmail"), attr("user", "Mentor", "OwnerEmail")],
  "rec.OwnerEmail in ['']":
    ["In", attr("rec", "OwnerEmail"), ["List", ["Const", ""]]],
  "rec.ShareToken == user.LinkKey.StageToken":
    ["Eq", attr("rec", "ShareToken"), attr("user", "LinkKey", "StageToken")],
  "rec.ShareToken == user.LinkKey.StageToken and (newRec.OwnerEmail == user.Mentor.OwnerEmail or user.IsLoggedIn == True)":
    ["And", ["Eq", attr("rec", "ShareToken"), attr("user", "LinkKey", "StageToken")], ["Or", ["Eq", attr("newRec", "OwnerEmail"), attr("user", "Mentor", "OwnerEmail")], ["Eq", attr("user", "IsLoggedIn"), ["Const", true]]]],
  "rec.Title != newRec.Title":
    ["NotEq", attr("rec", "Title"), attr("newRec", "Title")],
  "rec.Title == \"sensitive-literal\"":
    ["Eq", attr("rec", "Title"), ["Const", "sensitive-literal"]],
  "rec.Title == ''":
    ["Eq", attr("rec", "Title"), ["Const", ""]],
  "rec.Title == 'opaque-private'":
    ["Eq", attr("rec", "Title"), ["Const", "opaque-private"]],
  "rec.Title == 'private-secret'":
    ["Eq", attr("rec", "Title"), ["Const", "private-secret"]],
  "rec.Title == user.Email":
    ["Eq", attr("rec", "Title"), attr("user", "Email")],
  "rec.UserId != newRec.UserId":
    ["NotEq", attr("rec", "UserId"), attr("newRec", "UserId")],
  "rec.UserId == ''":
    ["Eq", attr("rec", "UserId"), ["Const", ""]],
  "rec.UserId == -1":
    null,
  "rec.UserId == 2":
    ["Eq", attr("rec", "UserId"), ["Const", 2]],
  "rec.UserId in [0, 1]":
    ["In", attr("rec", "UserId"), ["List", ["Const", 0], ["Const", 1]]],
  "user.Access == EDITOR":
    ["Eq", attr("user", "Access"), name("EDITOR")],
  "user.Access == OWNER":
    ["Eq", attr("user", "Access"), name("OWNER")],
  "user.Access == VIEWER":
    ["Eq", attr("user", "Access"), name("VIEWER")],
  "user.Access in [EDITOR, VIEWER]":
    ["In", attr("user", "Access"), ["List", name("EDITOR"), name("VIEWER")]],
  "user.Access in [OWNER, ADMIN]":
    ["In", attr("user", "Access"), ["List", name("OWNER"), name("ADMIN")]],
  "user.Access in [OWNER, OWNER]":
    ["In", attr("user", "Access"), ["List", name("OWNER"), name("OWNER")]],
  "user.Access in [OWNER]":
    ["In", attr("user", "Access"), ["List", name("OWNER")]],
  "user.Access in [VIEWER, EDITOR]":
    ["In", attr("user", "Access"), ["List", name("VIEWER"), name("EDITOR")]],
  "user.Access not in [VIEWER, OWNER]":
    ["NotIn", attr("user", "Access"), ["List", name("VIEWER"), name("OWNER")]],
  "user.Email == True":
    ["Eq", attr("user", "Email"), ["Const", true]],
  "user.Email in ['private@example.com', 'other@example.com']":
    ["In", attr("user", "Email"), ["List", ["Const", "private@example.com"], ["Const", "other@example.com"]]],
  "user.IsLoggedIn == 1":
    ["Eq", attr("user", "IsLoggedIn"), ["Const", 1]],
  "user.IsLoggedIn == True":
    ["Eq", attr("user", "IsLoggedIn"), ["Const", true]],
  "user.IsLoggedIn in [True, False]":
    ["In", attr("user", "IsLoggedIn"), ["List", ["Const", true], ["Const", false]]],
  "user.LinkKey.StageToken == 'private-value' and user.Access == OWNER":
    ["And", ["Eq", attr("user", "LinkKey", "StageToken"), ["Const", "private-value"]], ["Eq", attr("user", "Access"), name("OWNER")]],
  "user.LinkKey.StageToken == 'sensitive-value'":
    ["Eq", attr("user", "LinkKey", "StageToken"), ["Const", "sensitive-value"]],
  "user.LinkKey.StageToken == newRec.ShareToken and rec.OwnerEmail == user.Email":
    ["And", ["Eq", attr("user", "LinkKey", "StageToken"), attr("newRec", "ShareToken")], ["Eq", attr("rec", "OwnerEmail"), attr("user", "Email")]],
  "user.LinkKey.StageToken == rec.ShareToken":
    ["Eq", attr("user", "LinkKey", "StageToken"), attr("rec", "ShareToken")],
  "user.LinkKey.StageToken == rec.ShareToken or user.Access == OWNER and rec.OwnerEmail == user.Email":
    ["Or", ["Eq", attr("user", "LinkKey", "StageToken"), attr("rec", "ShareToken")], ["And", ["Eq", attr("user", "Access"), name("OWNER")], ["Eq", attr("rec", "OwnerEmail"), attr("user", "Email")]]],
  "user.LinkKey.token == 'do-not-expose'":
    ["Eq", attr("user", "LinkKey", "token"), ["Const", "do-not-expose"]],
  "user.LinkKey.token == 'secret'":
    ["Eq", attr("user", "LinkKey", "token"), ["Const", "secret"]],
  "user.SessionID == 'private-token'":
    ["Eq", attr("user", "SessionID"), ["Const", "private-token"]],
};

export function nativeAclFixture(formula: string): string {
  if (formula === "") return "";
  const predicate = predicates[formula];
  if (predicate === undefined) throw new Error(`Missing native ACL test fixture for ${formula}`);
  return predicate === null ? "" : JSON.stringify(predicate);
}
