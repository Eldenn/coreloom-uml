import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { deleteAccountInput } from '#app/account/validators/account-input'
import AssistantFile from '#app/assistant/models/assistant-file'
import { deleteConversationFileTexts } from '#app/assistant/services/conversation-files'
import { DEFAULT_ACCOUNT_MANAGED_MESSAGE } from '#app/auth/constants/default-account'
import { isDefaultAccount } from '#app/auth/services/default-account'
import CodeMap from '#app/code-maps/models/code-map'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'
import { forgetClaude } from '#app/llm-connections/services/claude-code-connections'

export default class DeleteAccountController {
  async handle({ request, auth, response }: HttpContext) {
    const { password } = await request.validateUsing(deleteAccountInput)
    const user = auth.getUserOrFail()

    // It would be recreated on the next deploy anyway.
    if (isDefaultAccount(user)) {
      return response.forbidden({ error: { message: DEFAULT_ACCOUNT_MANAGED_MESSAGE } })
    }

    if (!(await hash.verify(user.password, password))) {
      return response.badRequest({
        error: { message: 'Your password is incorrect.' },
      })
    }

    await auth.use('web').logout()
    const codeMaps = await CodeMap.query().where('userId', user.id).select('storageKey')
    const files = await AssistantFile.query().where('userId', user.id).select('storageKey')
    await user.delete()
    // The Claude credentials live in a folder, code maps and the assistant's files in Drive, not
    // in rows: the cascade does not reach them.
    await forgetClaude(user)
    await deleteCodeMapFiles(codeMaps.map((codeMap) => codeMap.storageKey))
    await deleteConversationFileTexts(files.map((file) => file.storageKey))

    return response.noContent()
  }
}
