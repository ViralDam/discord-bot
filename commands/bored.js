const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch')
const { openAiApiKey, openJourneyApi } = require('../config.json');
const { Configuration, OpenAIApi } = require("openai");

//setting up openai with config, apikey
const configuration = new Configuration({
  apiKey: openAiApiKey,
});
const openai = new OpenAIApi(configuration);

/**
 * 
 * Make openjourney api call hosted on hugging-face
 * @param {*} data 
 * @returns image according to the input data
 */
async function queryImage(data) {
    const response = await fetch(
        "https://api-inference.huggingface.co/models/prompthero/openjourney-v4",
        {
            headers: { Authorization: openJourneyApi },
            method: "POST",
            body: JSON.stringify(data),
        }
    );
    const result = await response.blob();
    return result;
}

/**
 * 
 * calls bored api with the params
 * @param {*} params 
 * @returns activity in json format
 */
async function query(params) {
    let queryParams = (new URLSearchParams(params)).toString();
    let url = `http://www.boredapi.com/api/activity?${queryParams}`;
    var response = await fetch(
        url,
        {
            method: "GET",
        }
    );
    return response.json();
}


/**
 * 
 * returns object containing data about the command
 * and
 * commands execute function which gets executed when this command gets triggered
 * bored command has optional params
 * -type takes in type of activity you looking for
 * -free weather user wants activity to be free
 * -solo weather user wants to do it solo or not
 * and returns an actvity along with few lines describing it
 * and an image showcasing that activity generated by open journey
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('bored')
        .setDescription('Replies with an activity to do!')
        .addStringOption(option =>
            option.setName('type')
                .addChoices(
                    { name: 'Education', value: 'education' },
                    { name: 'Recreational', value: 'recreational' },
                    { name: 'Social', value: 'social' },
                    { name: 'DIY', value: 'diy' },
                    { name: 'Charity', value: 'charity' },
                    { name: 'Cooking', value: 'cooking' },
                    { name: 'Relaxation', value: 'relaxation' },
                    { name: 'Music', value: 'music' },
                    { name: 'Busywork', value: 'busywork' },
                )
                .setDescription('Type of activity you want to do!'))
        .addBooleanOption(option =>
            option.setName('free')
                .setDescription('Do you not want to spend?'))
        .addBooleanOption(option =>
            option.setName('solo')
                .setDescription('Do you not want to do it alone?')),
    async execute(interaction) {

        // send initial thinking msg
        await interaction.deferReply();

        //make params for bored api call
        let params = {};
        const isFree = interaction.options.getBoolean('free');
        if (isFree) {
            params['price']='0.0';
        }
        const isSolo = interaction.options.getBoolean('solo');
        if (isSolo) {
            params['participants']='1';
        }
        const type = interaction.options.getString('type');
        if (type) {
            params['type']=type;
        }

        //get an actrivity from bored api
        let response = await query(params);

        //make embeded reply
        const respEmbed = new EmbedBuilder()
            .setColor(0x8CD867)
            .setTitle(response.activity)
            .setDescription(":arrows_clockwise:")
            .addFields(
                { name: 'Type', value: response.type.charAt(0).toUpperCase() + response.type.slice(1), inline: true},
                { name: 'Participants', value: response.participants.toString(), inline: true},
            );
        if(response.link) {
            respEmbed.setURL(response.link);
        }
        
        //reply with activity
        interaction.editReply({ embeds: [respEmbed] }); // Update 1 with the initial activity

        try {
            //use gpt to get activity description
            const activityDescription = await openai.createCompletion({
                model: "text-davinci-003",
                max_tokens: 100,
                prompt: "Given activity, elaborate a bit in max 2 sentences about it. \n Activity: " + response.activity + "\n Suggestion:",
            });
    
            //update the reply with description
            respEmbed.setDescription(activityDescription.data.choices[0].text.trim());
            interaction.editReply({ embeds: [respEmbed] }); // Update 2 with the description generated by gpt
        } catch (error) {
            console.log(error);
            respEmbed.setDescription(null);
            return;
        }

        try {
            //get image description from gpt
            const imageDescription = await openai.createCompletion({
                model: "text-davinci-003",
                max_tokens: 100,
                prompt: "Covert given activity into a description of an image in few words that can be used as a prompt to a text to image model. \n Activity: " + response.activity + "\n Image Description:",
            });
    
            //get image from openjourney
            let imageResponse = await queryImage({ "inputs": imageDescription.data.choices[0].text.trim() });
            const abuff = await imageResponse.arrayBuffer();
            const buf = new Buffer.from(abuff);
            let attachmentBuilder = new AttachmentBuilder(buf, { name: 'image.jpg' });
    
            //update the reply with image
            respEmbed.setImage('attachment://image.jpg');
            respEmbed.setFooter({text: 'Image generated using open journey.'});
            interaction.editReply({ embeds: [respEmbed], files: [attachmentBuilder] }); // update 3 with the image created by open journey
        } catch (error) {
            console.log(error);
        }
    },
};