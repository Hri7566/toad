declare interface MPPUser {
    _id: string;
    name: string;
    color: string;
    tag: Tag;
}

declare interface Tag {
    text: string;
    color: string;
}

declare interface Participant extends MPPUser {
    id: string;
    afk: boolean;
}

declare interface Channel {
    _id: string;
    id: string;

    settings: ChannelSettings;
    crown: Crown;
}

declare type ChannelSettings = Partial<{
    lobby: boolean;
    visible: boolean;
    chat: boolean;
    crownsolo: boolean;
    "no cussing": boolean;
    noindex: boolean;
    allowBots: boolean;
    color: string;
    color2: string;
    limit: number;
    minOnlineTime: number;
}>;

declare interface Crown {
    participantId: string | undefined;
    userId: string | undefined;

    startPos: Vector2;
    endPos: Vector2;
}

declare interface Vector2 {
    x: number;
    y: number;
}
