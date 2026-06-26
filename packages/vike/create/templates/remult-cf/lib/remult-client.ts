import { remult } from 'remult';
import { RemultPartySubscriptionClient } from 'remult-partykit';

export function initRemultRealtime(host: string) {
	const client = new RemultPartySubscriptionClient({
		getSocketUrl: (roomName: string) => {
			const wsHost = host.replace(/^http/, 'ws');
			return `${wsHost}/party/remult?room=${roomName}`;
		}
	});
	remult.apiClient.subscriptionClient = client;
}
