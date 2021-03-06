<?php

namespace HtmlToProseMirror\Test;

use HtmlToProseMirror\Renderer;

class SpecialCharacterTest extends TestCase
{
    /** @test */
    public function emojis_are_transformed_correctly()
    {
        $html = "<p>π₯</p>";

        $json = [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => "π₯",
                        ],
                    ],
                ],
            ],
        ];

        $this->assertEquals($json, (new Renderer)->render($html));
    }

    /** @test */
    public function extended_emojis_are_transformed_correctly()
    {
        $html = "<p>π©βπ©βπ¦</p>";

        $json = [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => "π©βπ©βπ¦",
                        ],
                    ],
                ],
            ],
        ];

        $this->assertEquals($json, (new Renderer)->render($html));
    }

    /** @test */
    public function umlauts_are_transformed_correctly()
    {
        $html = "<p>Γ€ΓΆΓΌΓΓΓΓ</p>";

        $json = [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => "Γ€ΓΆΓΌΓΓΓΓ",
                        ],
                    ],
                ],
            ],
        ];

        $this->assertEquals($json, (new Renderer)->render($html));
    }

    /** @test */
    public function html_entities_are_transformed_correctly()
    {
        $html = "<p>&lt;</p>";

        $json = [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => "<",
                        ],
                    ],
                ],
            ],
        ];

        $this->assertEquals($json, (new Renderer)->render($html));
    }
}
