"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

export async function repairOrphansAction() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const ROOT_ID = '04eb7091-6876-41e0-84c6-5891658a5768'

  // On ne met à jour QUE owner_id et user_id pour ne pas casser le lien commercial
  const { error } = await supabase
    .from('restaurants')
    .update({ 
        owner_id: ROOT_ID,
        user_id: ROOT_ID 
    })
    .is('owner_id', null)

  if (error) return { success: false, error: error.message }

  revalidatePath('/super-admin/root')
  return { success: true }
}