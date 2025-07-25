// index.js
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import fetch from 'node-fetch';
import fs from 'fs';
import 'dotenv/config';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('snapshot')
    .setDescription('Get a snapshot of all holders for an NFT collection')
    .addStringOption(option =>
      option.setName('contract')
        .setDescription('Contract address of the NFT collection')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('destination')
        .setDescription('Where to send the result: dm or channel')
        .addChoices({ name: 'dm', value: 'dm' }, { name: 'channel', value: 'channel' })
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'snapshot') return;

  const contract = interaction.options.getString('contract');
  const destination = interaction.options.getString('destination');

  await interaction.deferReply({ ephemeral: destination === 'dm' });

  const holders = await getHolders(contract);

  if (!holders || holders.length === 0) {
    return interaction.editReply('❌ No holders found or invalid contract address.');
  }

  const content = holders.map(h => `${h.address},${h.balance}`).join('\n');
  const fileName = `snapshot_${contract.slice(0, 6)}.csv`;
  fs.writeFileSync(fileName, `Wallet,Balance\n${content}`);

  const file = new AttachmentBuilder(fileName);

  if (destination === 'dm') {
    const user = await interaction.user.createDM();
    await user.send({ content: `📦 Snapshot for contract \`${contract}\`:`, files: [file] });
    await interaction.editReply('✅ Snapshot sent to your DM.');
  } else {
    await interaction.editReply({ content: `📦 Snapshot for contract \`${contract}\`:`, files: [file] });
  }

  fs.unlinkSync(fileName);
});

// Subsquid GraphQL API for HyperLiquid NFTs
async function getHolders(contract) {
  try {
    const query = `{
      nftHolders(contract: \"${contract.toLowerCase()}\") {
        address
        balance
      }
    }`;

    const res = await fetch('https://v2.archive.subsquid.io/network/hyperliquid-mainnet/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const json = await res.json();
    return json.data?.nftHolders || [];
  } catch (e) {
    console.error('Error fetching holders:', e);
    return null;
  }
}

client.login(process.env.DISCORD_TOKEN);
