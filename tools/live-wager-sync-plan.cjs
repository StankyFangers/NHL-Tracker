'use strict'
const {planMigration}=require('./live-wager-migration-plan.cjs')
// Read-only operation proposal. No network calls or data mutation.
function proposeSync(local,cloudRows,options={}) {
 const plan=planMigration(local,cloudRows)
 const approved=options.ownerConfirmed===true && options.backupConfirmed===true
 const clean=plan.conflicts.length===0
 return {
  ...plan,
  approved,
  requiresManualReview:!clean,
  canStartCreateOnly:approved&&clean,
  creates:approved&&clean?plan.localOnly.map(id=>({method:'POST',id})):[],
  updates:[],
  deletes:[],
  blockedReasons:[
   ...(!options.backupConfirmed?['Backups required']:[]),
   ...(!options.ownerConfirmed?['Owner confirmation required']:[]),
   ...(!clean?['Conflicts require review']:[])
  ]
 }
}
module.exports={proposeSync}
